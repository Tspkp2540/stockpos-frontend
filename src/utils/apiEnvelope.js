const ENVELOPE_HEADER = "X-StockPOS-Envelope";
const ENVELOPE_MARKER = "__stockpos_envelope";
const ENVELOPE_VERSION = "1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const enabled = import.meta.env.PROD
  && import.meta.env.VITE_API_PAYLOAD_ENCRYPTION_ENABLED === "true";

const toBase64Url = (bytes) => {
  let binary = "";
  new Uint8Array(bytes).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value) => {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const headerValue = (headers, name) => headers?.get?.(name)
  || headers?.[name]
  || headers?.[name.toLowerCase()];

const authTokenFor = (config) => {
  const value = headerValue(config.headers, "Authorization");
  const [scheme, token] = String(value || "").split(" ");
  return scheme === "Bearer" && token ? token : null;
};

const aadFor = (config) => {
  const pathname = new URL(config.url, window.location.origin).pathname;
  return encoder.encode(`${String(config.method || "get").toUpperCase()}:${pathname}`);
};

const keyFor = async (token) => {
  const seed = encoder.encode(`stockpos-api-envelope:v1:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", seed);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
};

const encrypt = async (data, token, config) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(token);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aadFor(config), tagLength: 128 },
    key,
    encoder.encode(JSON.stringify(data === undefined ? null : data)),
  );
  const encryptedBytes = new Uint8Array(ciphertext);
  return {
    [ENVELOPE_MARKER]: Number(ENVELOPE_VERSION),
    iv: toBase64Url(iv),
    tag: toBase64Url(encryptedBytes.slice(-16)),
    ciphertext: toBase64Url(encryptedBytes.slice(0, -16)),
  };
};

const decrypt = async (envelope, token, config) => {
  const key = await keyFor(token);
  const ciphertext = fromBase64Url(envelope.ciphertext);
  const tag = fromBase64Url(envelope.tag);
  const sealed = new Uint8Array(ciphertext.length + tag.length);
  sealed.set(ciphertext);
  sealed.set(tag, ciphertext.length);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(envelope.iv), additionalData: aadFor(config), tagLength: 128 },
    key,
    sealed,
  );
  return JSON.parse(decoder.decode(plaintext));
};

const isEnvelope = (data) => Number(data?.[ENVELOPE_MARKER]) === Number(ENVELOPE_VERSION);
const shouldEncryptPayload = (config, token) => enabled
  && Boolean(token)
  && ["post", "put", "patch", "delete"].includes(String(config.method || "get").toLowerCase())
  && config.data !== undefined
  && !(config.data instanceof FormData)
  && !(config.data instanceof Blob);

export const installApiEnvelope = (axios) => {
  if (!enabled) return;

  axios.interceptors.request.use(async (config) => {
    const token = authTokenFor(config);
    if (!token) return config;
    config.headers = config.headers || {};
    if (config.headers.set) config.headers.set(ENVELOPE_HEADER, ENVELOPE_VERSION);
    else config.headers[ENVELOPE_HEADER] = ENVELOPE_VERSION;
    if (shouldEncryptPayload(config, token)) config.data = await encrypt(config.data, token, config);
    return config;
  });

  const decryptResponse = async (response) => {
    if (!isEnvelope(response?.data)) return response;
    const token = authTokenFor(response.config || {});
    if (!token) throw new Error("Encrypted API response has no session token");
    response.data = await decrypt(response.data, token, response.config);
    return response;
  };

  axios.interceptors.response.use(
    decryptResponse,
    async (error) => {
      if (error?.response) await decryptResponse(error.response);
      return Promise.reject(error);
    },
  );
};

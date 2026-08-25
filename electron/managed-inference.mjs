const TOKEN = /^[0-9a-f]{64}$/;

export function normalizeManagedInferenceBrokerUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return "";
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return "";
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) return "";
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

export function managedInferenceAccess(brokerUrl, credentials) {
  const url = normalizeManagedInferenceBrokerUrl(brokerUrl);
  const token = credentials?.inferenceBrokerToken;
  if (!url || !TOKEN.test(token ?? "")) return null;
  return { url, token };
}

export function managedInferenceChildEnvironment(brokerUrl, credentials, environment) {
  const next = { ...environment };
  delete next.OMB_INFERENCE_BROKER_URL;
  delete next.OMB_INFERENCE_BROKER_TOKEN;
  const url = normalizeManagedInferenceBrokerUrl(brokerUrl);
  if (url) next.OMB_INFERENCE_BROKER_URL = url;
  const access = managedInferenceAccess(brokerUrl, credentials);
  if (access) next.OMB_INFERENCE_BROKER_TOKEN = access.token;
  return next;
}

export async function ensureManagedInferenceCredentials({
  brokerUrl,
  credentials,
  fetchImpl = globalThis.fetch,
  saveCredentials,
  log = () => {},
  timeoutSignal = (milliseconds) => AbortSignal.timeout(milliseconds),
  existingCredentialTimeoutMs = 8_000,
  registrationTimeoutMs = 15_000,
}) {
  const url = normalizeManagedInferenceBrokerUrl(brokerUrl);
  if (!url) {
    if (brokerUrl) log("hosted-inference broker URL rejected: HTTPS or a loopback HTTP URL is required");
    return credentials;
  }
  if (TOKEN.test(credentials.inferenceBrokerToken ?? "")) {
    try {
      const check = await fetchImpl(`${url}/v1/me`, {
        headers: { authorization: `Bearer ${credentials.inferenceBrokerToken}` },
        redirect: "error",
        signal: timeoutSignal(existingCredentialTimeoutMs),
      });
      if (check.ok) return credentials;
      // Only a definitive auth failure rotates the credential. A transient
      // outage keeps the existing identity so reconnecting cannot strand the
      // user's remaining frontier credits under a new installation.
      if (check.status !== 401) return credentials;
      delete credentials.inferenceBrokerToken;
      delete credentials.inferenceInstallationId;
    } catch {
      return credentials;
    }
  }
  try {
    const response = await fetchImpl(`${url}/v1/installations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      redirect: "error",
      signal: timeoutSignal(registrationTimeoutMs),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
    if (!TOKEN.test(body?.token ?? "") || typeof body?.installationId !== "string") {
      throw new Error("the hosted-inference service returned invalid credentials");
    }
    credentials.inferenceBrokerToken = body.token;
    credentials.inferenceInstallationId = body.installationId;
    await saveCredentials(credentials);
    log("hosted-inference installation registered");
  } catch (error) {
    log(`hosted-inference registration failed: ${error?.message ?? error}`);
  }
  return credentials;
}

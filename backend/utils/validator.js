export const validateUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export const normalizeUrl = (url) => {
  if (!url) return "";

  const trimmed = url.trim();
  if (trimmed === "") return "";

  // Already has protocol
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  // Add https:// by default
  return `https://${trimmed}`;
};

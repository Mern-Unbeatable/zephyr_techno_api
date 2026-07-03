import env from '../config/env.js';

/**
 * Builds a full URL for an uploaded file based on the environment.
 * @param {string} filePath - The relative file path (e.g., 'uploads/image.jpg').
 * @returns {string} The complete URL.
 */
export const buildImageUrl = (filePath) => {
  if (!filePath) return null;
  
  // Normalize path to use forward slashes
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  if (env.nodeEnv === 'production') {
    // Assuming you have a LIVE_URL in env, otherwise fallback to a default production URL
    const baseUrl = process.env.LIVE_URL || 'https://api.zephyrtechnology.co.uk';
    return `${baseUrl}/${normalizedPath}`;
  } else {
    return `http://localhost:${env.port}/${normalizedPath}`;
  }
};

import { z } from 'zod';

export const ReleaseTypeSchema = z.enum([
  'stable',
  'beta',
  'canary',
  'internal',
]);

declare global {
  // THIS variable should be replaced during the build process
  const REPLACE_ME_BUILD_ENV: string;
}

export const envBuildType = (process.env.BUILD_TYPE || REPLACE_ME_BUILD_ENV)
  .trim()
  .toLowerCase();

export const overrideSession = process.env.BUILD_TYPE === 'internal';

export const buildType = ReleaseTypeSchema.parse(envBuildType);

export const mode = process.env.NODE_ENV;
export const isDev = mode === 'development';

const API_URL_MAPPING = {
  stable: `https://app.compose.pro`,
  beta: `https://insider.compose.pro`,
  canary: `https://affine.fail`,
  internal: `https://insider.compose.pro`,
};

export const CLOUD_BASE_URL =
  process.env.DEV_SERVER_URL || API_URL_MAPPING[buildType];

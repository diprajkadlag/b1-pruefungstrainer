// Explicit .js extensions: required by NodeNext resolution, which the server
// uses. TypeScript maps them back to the .ts sources at compile time, and the
// web app's bundler resolves them the same way.
export * from './scoring.js';
export * from './types.js';

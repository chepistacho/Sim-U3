import { defineConfig } from 'vite';

// Relative assets make the same build work locally and under
// https://<user>.github.io/<repository>/ without hard-coding the repo name.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022'
  }
});

module.exports = {
  '*.{js,cjs,mjs,ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.{json,css,html}': 'prettier --write',
};

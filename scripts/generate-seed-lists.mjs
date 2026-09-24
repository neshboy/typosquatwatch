// One-off generator: builds the static npm/PyPI "popular package" seed lists shipped
// in data/. This is a dev-time helper, NOT run by the CLI at scan time — the CLI only
// ever reads the resulting committed JSON files.
//
// The npm list is a merge of:
//   1. A real, published ranking ("Top 1000 most depended-upon npm packages", a
//      2019-08-16 snapshot from the community-maintained anvaka/npm-rank gist,
//      https://gist.github.com/anvaka/8e8fa57c7ee1350e3491) fetched over the network, and
//   2. A manually curated list covering well-known packages that postdate that 2019
//      snapshot (vite, zod, pnpm, tRPC, @tanstack/*, etc.) or that the dependency-graph
//      ranking under-counts (CLI tools, cloud SDKs, framework meta-packages).
// This is documented as-is in the README: it is a curated seed list, not a live top-5000
// pulled fresh from download-count APIs (npm's public API has no "list top N packages by
// downloads" endpoint — only per-package lookups).
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

// Optional: path to a locally-fetched copy of the anvaka/npm-rank
// "01.most-dependent-upon.md" gist file. If present, its package names are merged in.
const fetchedRankingPath = process.argv[2] ?? null;

function parseMostDependedUponMarkdown(markdown) {
  const names = [];
  // Lines look like: `12. [bluebird](https://www.npmjs.org/package/bluebird) - 18381`
  const lineRe = /^\d+\.\s*\[([^\]]+)\]/gm;
  let match;
  while ((match = lineRe.exec(markdown)) !== null) {
    names.push(match[1]);
  }
  return names;
}

const npmPackages = [
  // Core language / build tooling
  "typescript", "eslint", "prettier", "babel", "@babel/core", "@babel/cli",
  "@babel/preset-env", "@babel/preset-react", "@babel/preset-typescript",
  "@babel/plugin-transform-runtime", "@babel/runtime", "@babel/parser",
  "@babel/traverse", "@babel/generator", "webpack", "webpack-cli",
  "webpack-dev-server", "webpack-merge", "rollup", "vite", "parcel",
  "esbuild", "@swc/core", "@swc/cli", "browserify", "gulp", "gulp-cli",
  "grunt", "grunt-cli", "ts-node", "tsx", "tslib", "nx", "lerna", "turbo",
  "rimraf", "cross-env", "dotenv", "dotenv-expand", "cross-spawn",
  "concurrently", "npm-run-all", "husky", "lint-staged", "commitizen",
  "semantic-release", "standard-version", "np", "yarn", "pnpm",
  "npm-check-updates", "depcheck", "verdaccio", "changesets", "@changesets/cli",
  "esbuild-loader", "ts-loader", "babel-loader", "css-loader", "style-loader",
  "sass-loader", "file-loader", "url-loader", "html-webpack-plugin",
  "mini-css-extract-plugin", "terser-webpack-plugin", "copy-webpack-plugin",
  "fork-ts-checker-webpack-plugin", "postcss-loader", "vite-tsconfig-paths",
  "@vitejs/plugin-react", "@vitejs/plugin-vue", "unplugin-vue-components",
  "eslint-config-airbnb", "eslint-config-airbnb-base", "eslint-plugin-react",
  "eslint-plugin-react-hooks", "eslint-plugin-import", "eslint-plugin-jsx-a11y",
  "eslint-config-prettier", "eslint-plugin-prettier", "eslint-config-standard",
  "stylelint", "stylelint-config-standard", "tslint", "@typescript-eslint/parser",
  "@typescript-eslint/eslint-plugin", "typescript-eslint",

  // Testing
  "jest", "mocha", "chai", "jasmine", "karma", "ava", "tape", "vitest",
  "cypress", "playwright", "@playwright/test", "puppeteer", "puppeteer-core",
  "selenium-webdriver", "webdriverio", "testcafe", "sinon", "nyc", "istanbul",
  "c8", "supertest", "nock", "msw", "@testing-library/react",
  "@testing-library/jest-dom", "@testing-library/user-event",
  "@testing-library/dom", "@testing-library/vue", "enzyme",
  "enzyme-adapter-react-16", "jest-environment-jsdom", "ts-jest",
  "babel-jest", "jest-cli", "jsdom", "happy-dom", "cucumber",
  "@cucumber/cucumber", "nightwatch", "jest-mock", "vitest-mock-extended",

  // Frontend frameworks & ecosystem
  "react", "react-dom", "react-router", "react-router-dom", "redux",
  "react-redux", "redux-thunk", "redux-saga", "@reduxjs/toolkit", "mobx",
  "mobx-react", "mobx-react-lite", "recoil", "zustand", "jotai", "vue",
  "vue-router", "vuex", "pinia", "@vue/cli", "@vue/compiler-sfc",
  "@vue/runtime-core", "vue-i18n", "@angular/core", "@angular/common",
  "@angular/cli", "@angular/forms", "@angular/router", "@angular/platform-browser",
  "@angular/compiler", "svelte", "@sveltejs/kit", "@sveltejs/vite-plugin-svelte",
  "solid-js", "preact", "lit", "lit-element", "lit-html", "alpinejs",
  "backbone", "jquery", "next", "next-auth", "next-seo", "next-i18next",
  "nuxt", "@nuxt/kit", "gatsby", "remix", "@remix-run/react",
  "@remix-run/node", "astro", "ember-cli", "ember-source",

  // Styling / CSS
  "styled-components", "@emotion/react", "@emotion/styled", "@emotion/css",
  "tailwindcss", "postcss", "autoprefixer", "postcss-preset-env",
  "purgecss", "@fullhuman/postcss-purgecss", "sass", "node-sass", "less",
  "stylus", "csso", "cssnano", "classnames", "clsx",

  // State / data / animation / viz
  "rxjs", "immutable", "immer", "ramda", "lodash", "lodash.debounce",
  "lodash.throttle", "lodash.merge", "lodash.clonedeep", "lodash.isequal",
  "lodash-es", "underscore", "xstate", "framer-motion", "gsap",
  "lottie-web", "d3", "d3-array", "d3-scale", "d3-shape", "chart.js",
  "recharts", "victory", "three", "three-stdlib", "gl-matrix", "p5",

  // Node / backend frameworks
  "express", "express-session", "express-rate-limit", "koa", "koa-router",
  "fastify", "hapi", "@hapi/hapi", "restify", "@nestjs/core",
  "@nestjs/common", "@nestjs/platform-express", "@nestjs/testing",
  "socket.io", "socket.io-client", "@socket.io/redis-adapter", "ws",
  "body-parser", "cookie-parser", "cors", "helmet", "morgan",
  "compression", "multer", "passport", "passport-local", "passport-jwt",
  "jsonwebtoken", "bcrypt", "bcryptjs", "joi", "yup", "zod", "ajv",
  "class-validator", "class-transformer", "rate-limiter-flexible", "csurf",

  // Databases / ORM
  "mongoose", "mongodb", "pg", "pg-hstore", "mysql", "mysql2", "sqlite3",
  "better-sqlite3", "sequelize", "typeorm", "prisma", "@prisma/client",
  "knex", "redis", "ioredis", "memcached", "level", "nedb",

  // HTTP / networking
  "axios", "node-fetch", "got", "superagent", "request", "isomorphic-fetch",
  "cross-fetch", "undici", "reconnecting-websocket",

  // CLI / terminal UX
  "chalk", "picocolors", "kleur", "colors", "ansi-styles", "strip-ansi",
  "ansi-colors", "cli-color", "commander", "yargs", "minimist", "inquirer",
  "enquirer", "prompts", "ora", "boxen", "cli-table3", "figlet",
  "gradient-string", "listr2", "cli-progress", "meow", "caporal", "sade",
  "vorpal", "oclif",

  // IDs / crypto / misc utils
  "uuid", "nanoid", "shortid", "cuid", "ulid", "short-uuid", "crypto-js",
  "seedrandom", "moment", "moment-timezone", "dayjs", "date-fns", "luxon",
  "async", "bluebird", "p-limit", "p-queue", "p-map", "p-retry", "p-timeout",
  "debug", "winston", "pino", "bunyan", "log4js", "fs-extra", "glob",
  "globby", "chokidar", "minimatch", "micromatch", "fast-glob", "mkdirp",
  "del", "trash", "tmp", "tempy", "execa", "shelljs", "which", "semver",
  "validate-npm-package-name", "read-pkg", "write-pkg", "find-up",
  "pkg-dir", "resolve", "resolve-from", "module-alias", "tsconfig-paths",
  "core-js", "regenerator-runtime", "whatwg-fetch", "es6-promise",
  "promise-polyfill", "object-assign", "prop-types", "react-is", "scheduler",

  // Templating / markdown
  "ejs", "pug", "handlebars", "mustache", "nunjucks", "marked",
  "markdown-it", "remark", "unified", "rehype", "gray-matter", "front-matter",

  // GraphQL
  "graphql", "apollo-server", "apollo-server-express", "@apollo/client",
  "apollo-client", "graphql-tag", "graphql-request", "type-graphql",
  "graphql-yoga",

  // Types
  "@types/node", "@types/react", "@types/react-dom", "@types/express",
  "@types/lodash", "@types/jest", "@types/mocha", "@types/chai",
  "@types/uuid", "@types/express-serve-static-core", "@types/cors",
  "@types/bcrypt", "@types/jsonwebtoken", "@types/koa",

  // Cloud / SDKs
  "aws-sdk", "@aws-sdk/client-s3", "@aws-sdk/client-dynamodb",
  "@aws-sdk/client-lambda", "@aws-sdk/credential-providers",
  "@aws-sdk/client-sqs", "@aws-sdk/client-sns", "firebase", "firebase-admin",
  "firebase-functions", "@google-cloud/storage", "@google-cloud/firestore",
  "@google-cloud/pubsub", "@azure/storage-blob", "@azure/identity",
  "@azure/msal-node", "stripe", "twilio", "@sendgrid/mail", "nodemailer",
  "algoliasearch", "aws-lambda", "serverless",

  // Mobile
  "react-native", "expo", "@expo/cli", "metro", "react-native-web",

  // React ecosystem extras
  "react-hook-form", "formik", "final-form", "react-final-form",
  "react-query", "@tanstack/react-query", "@tanstack/react-table", "swr",
  "react-intl", "i18next", "react-i18next", "react-virtualized",
  "react-window", "react-beautiful-dnd", "react-dnd", "react-slick",
  "slick-carousel", "swiper", "keen-slider", "embla-carousel",
  "react-spring", "react-use", "use-debounce", "react-error-boundary",
  "@loadable/component", "react-helmet", "react-helmet-async",
  "react-select", "react-transition-group", "react-infinite-scroll-component",

  // Scheduling / queues / messaging
  "node-cron", "cron", "agenda", "bull", "bullmq", "kue", "amqplib",
  "kafkajs", "mqtt",

  // File / media / parsing
  "sharp", "jimp", "canvas", "svgo", "imagemin", "file-type", "mime",
  "mime-types", "content-type", "qs", "query-string", "url-parse",
  "path-browserify", "buffer", "stream-browserify", "readable-stream",
  "through2", "pump", "split2", "csv-parser", "csv-parse", "csv-stringify",
  "fast-csv", "xlsx", "exceljs", "pdfkit", "pdf-lib", "jspdf", "html2canvas",
  "dompurify", "sanitize-html", "xss", "validator", "email-validator",
  "libphonenumber-js",

  // Monitoring / observability
  "web-vitals", "lighthouse", "@sentry/node", "@sentry/react", "@sentry/browser",
  "prom-client", "newrelic",
];

const pypiPackages = [
  "numpy", "pandas", "requests", "flask", "django", "scipy", "matplotlib",
  "scikit-learn", "tensorflow", "torch", "torchvision", "pytest", "boto3",
  "botocore", "click", "pyyaml", "sqlalchemy", "pillow", "beautifulsoup4",
  "lxml", "jinja2", "flask-sqlalchemy", "celery", "redis", "gunicorn",
  "uvicorn", "fastapi", "pydantic", "aiohttp", "httpx", "urllib3", "certifi",
  "charset-normalizer", "idna", "six", "setuptools", "wheel", "pip",
  "virtualenv", "tox", "black", "flake8", "mypy", "isort", "pylint",
  "coverage", "tqdm", "numba", "sympy", "networkx", "nltk", "spacy",
  "gensim", "opencv-python", "pyaudio", "pyserial", "paramiko", "cryptography",
  "pyjwt", "oauthlib", "requests-oauthlib", "google-auth",
  "google-api-python-client", "azure-storage-blob", "boto", "s3transfer",
  "jmespath", "python-dateutil", "pytz", "tzdata", "attrs", "packaging",
  "typing-extensions", "importlib-metadata", "zipp", "platformdirs",
  "filelock", "more-itertools", "jsonschema", "marshmallow",
  "python-dotenv", "environs", "dynaconf", "alembic", "psycopg2",
  "psycopg2-binary", "pymysql", "pymongo", "motor", "elasticsearch",
  "pika", "kombu", "billiard", "cachetools", "decorator", "wrapt",
  "deprecated", "colorama", "termcolor", "rich", "tabulate", "prettytable",
  "faker", "factory-boy", "hypothesis", "responses", "mock", "freezegun",
  "respx", "starlette", "websockets", "python-multipart", "itsdangerous",
  "werkzeug", "markupsafe", "greenlet", "gevent", "eventlet", "twisted",
  "scrapy", "selenium", "playwright", "xmltodict", "toml", "tomli",
  "pyparsing", "cffi", "pycparser", "pynacl", "bcrypt", "passlib",
  "argon2-cffi", "jsonpatch", "jsonpointer", "docutils", "sphinx",
  "pygments", "markdown", "pyarrow", "h5py", "xarray", "statsmodels",
  "seaborn", "plotly", "bokeh", "dash", "streamlit", "gradio", "openai",
  "anthropic", "langchain", "transformers", "huggingface-hub", "datasets",
  "accelerate", "sentencepiece", "tokenizers", "protobuf", "grpcio",
  "pyzmq", "psutil", "watchdog", "pathspec", "pluggy", "iniconfig",
  "exceptiongroup", "pycryptodome", "pyopenssl", "certbot", "docker",
  "kubernetes", "pyngrok",
];

function normalize(list) {
  return Array.from(new Set(list.map((s) => s.trim()))).sort((a, b) =>
    a.localeCompare(b)
  );
}

let mergedNpmPackages = npmPackages;
if (fetchedRankingPath && existsSync(fetchedRankingPath)) {
  const md = readFileSync(fetchedRankingPath, "utf8");
  const fetchedNames = parseMostDependedUponMarkdown(md);
  console.log(`Parsed ${fetchedNames.length} names from ${fetchedRankingPath}`);
  mergedNpmPackages = [...npmPackages, ...fetchedNames];
} else if (fetchedRankingPath) {
  console.warn(`WARNING: ${fetchedRankingPath} not found, using curated list only`);
}

const npmOut = normalize(mergedNpmPackages);
const pypiOut = normalize(pypiPackages);

writeFileSync(
  join(dataDir, "popular-npm-packages.json"),
  JSON.stringify(npmOut, null, 2) + "\n"
);
writeFileSync(
  join(dataDir, "popular-pypi-packages.json"),
  JSON.stringify(pypiOut, null, 2) + "\n"
);

console.log(`npm seed list: ${npmOut.length} packages`);
console.log(`PyPI seed list: ${pypiOut.length} packages`);

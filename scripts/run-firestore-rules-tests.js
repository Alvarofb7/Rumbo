import { createWriteStream, promises as fs } from 'node:fs';
import { createServer } from 'node:net';
import { get as getHttps } from 'node:https';
import { request as requestHttp } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const EMULATOR_URL = 'https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.19.8.jar';
const EMULATOR_SHA256 = '9d43599ed6151199e8d604dc87fac51218e49e5f3a48519b1ae560bbe5e3382d';
const PROJECT_ID = 'rumbo-test';
const HOST = '127.0.0.1';
const READY_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 5_000;
const MAX_ERROR_OUTPUT = 8_192;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rulesPath = path.join(root, 'firestore.rules');
const rulesTestPath = path.join(root, 'src', 'lib', 'firestore.rules.test.js');
const vitestPath = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const cachePath = path.join(os.homedir(), '.cache', 'rumbo', 'cloud-firestore-emulator-v1.19.8.jar');

let emulator;
let cleanupStarted = false;

function fail(message) {
  throw new Error(`Firestore rules test runner: ${message}`);
}

async function isUsableJar(filePath) {
  try {
    const handle = await fs.open(filePath, 'r');
    try {
      const header = Buffer.alloc(4);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      const stats = await handle.stat();
      const isZipJar = header.subarray(0, 2).toString() === 'PK';
      const isNativeEmulator = header.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
      if (!(stats.size > 4 && bytesRead === 4 && (isZipJar || isNativeEmulator))) return false;
      return createHash('sha256').update(await fs.readFile(filePath)).digest('hex') === EMULATOR_SHA256;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function downloadJar(destination) {
  return new Promise((resolve, reject) => {
    const request = getHttps(EMULATOR_URL, { timeout: READY_TIMEOUT_MS }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`download returned HTTP ${response.statusCode ?? 'unknown'}`));
        return;
      }

      const expectedLength = Number(response.headers['content-length']);
      let receivedLength = 0;
      response.on('data', (chunk) => {
        receivedLength += chunk.length;
      });

      pipeline(response, createWriteStream(destination, { flags: 'wx', mode: 0o600 }))
        .then(() => {
          if (Number.isFinite(expectedLength) && expectedLength > 0 && receivedLength !== expectedLength) {
            throw new Error(`download was truncated (${receivedLength} of ${expectedLength} bytes)`);
          }
          resolve();
        })
        .catch(reject);
    });
    request.once('timeout', () => request.destroy(new Error('download timed out')));
    request.once('error', reject);
  });
}

async function ensureEmulatorJar() {
  if (await isUsableJar(cachePath)) return cachePath;

  await fs.mkdir(path.dirname(cachePath), { recursive: true, mode: 0o700 });
  await fs.rm(cachePath, { force: true });
  const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.download`;

  try {
    await downloadJar(temporaryPath);
    if (!(await isUsableJar(temporaryPath))) fail('downloaded emulator file is not a valid JAR');
    await fs.rename(temporaryPath, cachePath);
    return cachePath;
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    fail(`could not download the emulator JAR from ${EMULATOR_URL}: ${error.message}`);
  }
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ host: HOST, port: 0, exclusive: true }, () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function isEmulatorReady(port) {
  return new Promise((resolve) => {
    const request = requestHttp({ host: HOST, port, path: '/', method: 'GET', timeout: 1_000 }, (response) => {
      response.resume();
      resolve(true);
    });
    request.once('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.once('error', () => resolve(false));
    request.end();
  });
}

async function waitForEmulator(port, child, output) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fail(`emulator exited before becoming ready (exit ${child.exitCode}).${output.value ? `\n${output.value}` : ''}`);
    }
    if (await isEmulatorReady(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  fail(`emulator did not become ready within ${READY_TIMEOUT_MS / 1000} seconds.${output.value ? `\n${output.value}` : ''}`);
}

function startEmulator(jarPath, port) {
  const output = { value: '' };
  const child = spawn('java', [
    '-Dgoogle.cloud_firestore.debug_log_level=FINE',
    '-Duser.language=en',
    '-jar', jarPath,
    `--host=${HOST}`,
    `--port=${port}`,
    `--rules=${rulesPath}`,
    `--project_id=${PROJECT_ID}`,
  ], { cwd: root, stdio: ['ignore', 'inherit', 'pipe'] });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    process.stderr.write(text);
    output.value = `${output.value}${text}`.slice(-MAX_ERROR_OUTPUT);
  });
  return { child, output };
}

function runVitest(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [vitestPath, 'run', rulesTestPath], {
      cwd: root,
      env: { ...process.env, FIRESTORE_EMULATOR_HOST: `${HOST}:${port}` },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function stopEmulator() {
  if (cleanupStarted || !emulator || emulator.exitCode !== null) return;
  cleanupStarted = true;
  emulator.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => emulator.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS)),
  ]);
  if (emulator.exitCode === null) emulator.kill('SIGKILL');
}

for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.once(signal, () => {
    stopEmulator().finally(() => {
      process.exit(exitCode);
    });
  });
}

async function main() {
  await fs.access(rulesPath).catch(() => fail(`rules file is missing: ${rulesPath}`));
  await fs.access(vitestPath).catch(() => fail(`Vitest is not installed at ${vitestPath}; install dependencies before running this command`));

  const jarPath = await ensureEmulatorJar();
  const port = await reservePort();
  const { child, output } = startEmulator(jarPath, port);
  emulator = child;

  await new Promise((resolve, reject) => {
    child.once('error', (error) => reject(new Error(`could not start Java. Install a JRE and ensure 'java' is on PATH: ${error.message}`)));
    child.once('spawn', resolve);
  });
  await waitForEmulator(port, child, output);
  return runVitest(port);
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  await stopEmulator();
}

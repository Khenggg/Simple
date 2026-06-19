import 'dotenv/config';

const requiredInProduction = ['DATABASE_URL', 'JWT_SECRET'];
if (process.env.NODE_ENV === 'production') {
  for (const key of requiredInProduction) {
    if (!process.env[key]) throw new Error(`Thiếu biến môi trường ${key}`);
  }
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/simpleoj',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret: process.env.JWT_SECRET || 'development-only-secret-change-before-deploy',
  pythonCommand: process.env.PYTHON_COMMAND || (process.platform === 'win32' ? 'python' : 'python3'),
  judgeServiceUrl: process.env.JUDGE_SERVICE_URL || '',
  judgeServiceToken: process.env.JUDGE_SERVICE_TOKEN || '',
  isProduction: process.env.NODE_ENV === 'production',
  maxGlobalPythonProcesses: Number(process.env.MAX_GLOBAL_PYTHON_PROCESSES || 5),
  pythonRunningTimeoutMs: Number(process.env.PYTHON_RUNNING_TIMEOUT_MS || 10000),
  pythonInputTimeoutMs: Number(process.env.PYTHON_INPUT_TIMEOUT_MS || 90000),
  pythonTotalTimeoutMs: Number(process.env.PYTHON_TOTAL_TIMEOUT_MS || 180000),
  terminalOutputLimitBytes: Number(process.env.TERMINAL_OUTPUT_LIMIT_BYTES || 262144), // 256KB
  terminalRunner: process.env.TERMINAL_RUNNER || 'client',
  serverTerminalEnabled: process.env.SERVER_TERMINAL_ENABLED === 'true'
};

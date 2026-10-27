import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const [scriptName, ...args] = process.argv.slice(2);

if (!scriptName) {
	throw new Error("Pass the package script to run, for example: dev:local");
}

const secretsFile = path.resolve(
	process.env.PORTFOLIO_SECRETS_FILE ??
		path.join(homedir(), ".config", "portfolio", "secrets.env"),
);

if (existsSync(secretsFile)) {
	if (typeof process.loadEnvFile !== "function") {
		throw new Error("Local secrets loading requires Node.js 20.12 or newer.");
	}
	process.loadEnvFile(secretsFile);
}

const npmArgs = ["run", scriptName];
if (args.length > 0) npmArgs.push("--", ...args);

const childEnv = { ...process.env };
if (scriptName !== "start:service:local") {
	delete childEnv.CTA_API_KEY;
	delete childEnv.NVIDIA_API_KEY;
}

const child = spawn("npm", npmArgs, { stdio: "inherit", env: childEnv });
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => child.kill(signal));
}
child.on("error", (error) => {
	console.error(`Unable to launch npm script ${scriptName}: ${error.message}`);
	process.exitCode = 1;
});
child.on("exit", (code, signal) => {
	process.exitCode = code ?? (signal ? 1 : 0);
});
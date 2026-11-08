import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const configPath = fileURLToPath(new URL("server/tsconfig.json", root));
const config = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
	...ts.sys,
	onUnRecoverableConfigFileDiagnostic(diagnostic) {
		throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
	},
});
assert.ok(config);
assert.equal(config.errors.length, 0, "service config must parse without errors");
assert.equal(config.options.resolveJsonModule, false, "service must not enable bundler JSON imports");

// Inspect the full program: imports can bypass tsconfig exclusions.
const program = ts.createProgram(config.fileNames, config.options);
for (const name of ["public-places", "geographic-map"]) {
	const path = fileURLToPath(new URL(`src/content/${name}.ts`, root));
	assert.ok(!program.getSourceFile(path), `${name} must stay frontend-only`);
}
for (const name of ["retrieval", "schema", "cta-geometry"]) {
	const path = fileURLToPath(new URL(`src/content/${name}.ts`, root));
	assert.ok(program.getSourceFile(path), `${name} must remain available to service checks`);
}
console.log("ok service compilation excludes frontend-only content and retains shared modules");

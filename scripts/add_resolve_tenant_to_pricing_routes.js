// One-shot: add resolveTenant middleware to every pricing route file.
// All other admin routes in this codebase follow the order
//   router.use(resolveTenant);
//   router.use(authenticateToken);
//   router.use(requireAuth);
// because authenticateToken requires req.tenant to be populated.
//
// Idempotent: skips files that already import resolveTenant.

const fs = require("fs");
const path = require("path");

const ROUTES_DIR = "/Users/zithmi/z-space/zithspace-be/src/routes/pricing";

const ROUTE_FILES = fs
  .readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => path.join(ROUTES_DIR, f));

let changed = 0;

for (const file of ROUTE_FILES) {
  let content = fs.readFileSync(file, "utf8");
  if (content.includes("resolveTenant")) {
    console.log(`· ${path.basename(file)} (already has resolveTenant)`);
    continue;
  }

  // 1) Add the import right after the auth middleware import.
  content = content.replace(
    /(import \{ authenticateToken, requireAuth \} from "@\/middleware\/auth";)/,
    `$1\nimport { resolveTenant } from "@/middleware/tenantContext";`
  );

  // 2) Insert router.use(resolveTenant); above router.use(authenticateToken);
  content = content.replace(
    /(\s*)(router\.use\(authenticateToken\);)/,
    `$1router.use(resolveTenant);$1$2`
  );

  fs.writeFileSync(file, content);
  changed++;
  console.log(`✓ ${path.basename(file)}`);
}

console.log(`\nDone. ${changed} files updated.`);

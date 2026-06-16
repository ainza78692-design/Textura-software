const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Adjust this depending on where your package.json is located relative to this script
const packageJsonPath = path.join(__dirname, "..", "package.json"); 
const updatesDir = path.join(__dirname, "..", "updates");

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", (err) => reject(err));
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function run() {
  try {
    const exePath = process.argv[2];
    if (!exePath) {
      console.error("Usage: node generate-update.js <path/to/Textura-Setup.exe>");
      process.exit(1);
    }

    if (!fs.existsSync(exePath)) {
      console.error(`Error: File not found at ${exePath}`);
      process.exit(1);
    }

    // 1. Read app version from package.json
    let version = "1.0.0";
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      version = pkg.version || "1.0.0";
    } else {
      console.warn(`Warning: package.json not found at ${packageJsonPath}. Defaulting to 1.0.0`);
    }

    // 2. Hash the executable
    console.log(`Calculating SHA-256 for ${exePath}...`);
    const hash = await sha256File(exePath);
    console.log(`Hash: ${hash}`);

    // 3. Create the updates directory if it doesn't exist
    if (!fs.existsSync(updatesDir)) {
      fs.mkdirSync(updatesDir, { recursive: true });
    }

    // 4. Construct the version.json payload
    // IMPORTANT: Make sure to replace YOUR_SERVER_DOMAIN with your actual production URL
    const exeFileName = path.basename(exePath);
    const downloadUrl = `http://100.91.86.65:4000/updates/downloads/${exeFileName}`;

    const manifest = {
      version: version,
      latestVersion: version,
      minimumSupportedVersion: "1.0.0",
      installerUrl: downloadUrl,
      sha256: hash,
      releaseNotesUrl: "http://100.91.86.65:4000/changelog", // Adjust if needed
      mandatory: false
    };

    const manifestPath = path.join(updatesDir, "version.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`\nSuccess! Generated version.json at: ${manifestPath}`);
    console.log("-------------------------------------------------");
    console.log("You can now securely SCP these two files to your production server:");
    console.log(`1. ${exePath}`);
    console.log(`2. ${manifestPath}`);
    console.log("\nExample command:");
    console.log(`scp "${exePath}" "${manifestPath}" yes_fashion@your-server-ip:/opt/textura/app/updates/`);
    
  } catch (error) {
    console.error("Failed to generate update manifest:", error);
    process.exit(1);
  }
}

run();

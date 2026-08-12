/**
 * Creates a staff account straight in the database.
 *
 *   node scripts/add-user.js "Shop Assistant" assistant@caceco.ca STAFF [store]
 *
 * It asks for the password rather than taking it as an argument, so it never
 * lands in your shell history. Roles: OWNER, MANAGER, STAFF, TECH.
 *
 * The optional 4th argument picks the store by name or id; without it the
 * account joins the oldest store.
 *
 * Run it from the `server` folder with the database reachable — the app itself
 * doesn't need to be running.
 */

require("dotenv").config();

const readline = require("readline");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const ROLES = ["OWNER", "MANAGER", "STAFF", "TECH"];

/** Read a line without printing what's typed. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      // Redraw the prompt so the password never appears on screen.
      if (![13, 10, 4].includes(String(char).charCodeAt(0))) {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(question);
      }
    };
    process.stdin.on("data", onData);
    rl.question(question, (answer) => {
      process.stdin.removeListener("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const [name, email, role = "STAFF"] = process.argv.slice(2);

  if (!name || !email) {
    console.log('Usage: node scripts/add-user.js "Full Name" email@example.com [ROLE]');
    console.log(`Roles: ${ROLES.join(", ")} (default STAFF)`);
    process.exit(1);
  }

  const wanted = role.toUpperCase();
  if (!ROLES.includes(wanted)) {
    console.error(`"${role}" isn't a role. Pick one of: ${ROLES.join(", ")}`);
    process.exit(1);
  }

  const password = await askHidden("Password for the new account (min 8 characters): ");
  if (!password || password.length < 8) {
    console.error("That password is too short — it needs at least 8 characters.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    // Staff belong to a store. Without one named, they join the first one.
    const wantedStore = process.argv[5];
    const store = wantedStore
      ? await prisma.store.findFirst({ where: { OR: [{ id: wantedStore }, { name: wantedStore }] } })
      : await prisma.store.findFirst({ orderBy: { createdAt: "asc" } });

    if (!store) {
      console.error(
        wantedStore
          ? `\nNo store called "${wantedStore}".`
          : "\nThere are no stores yet — run the migration and seed first."
      );
      process.exit(1);
    }

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role: wanted,
        passwordHash: await bcrypt.hash(password, 12),
        storeId: store.id,
      },
      select: { id: true, name: true, email: true, role: true },
    });
    console.log(`\nCreated ${user.name} <${user.email}> as ${user.role} at ${store.name}.`);
  } catch (err) {
    if (err.code === "P2002") {
      console.error(`\n${email} is already registered. Pick another address.`);
    } else {
      console.error(`\nCouldn't create the account: ${err.message}`);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();

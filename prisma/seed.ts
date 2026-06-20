import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("password123", 12);
  const superHash = await bcrypt.hash("SuperAdmin123!", 12);

  // Platform super admin — no companyId. Can't use upsert on a nullable compound key.
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { email: "superadmin@docvault.app", role: "SUPER_ADMIN" },
  });
  if (!existingSuperAdmin) {
    await prisma.user.create({
      data: {
        email: "superadmin@docvault.app",
        name: "Super Admin",
        passwordHash: superHash,
        role: "SUPER_ADMIN",
        forcePasswordChange: false, // SUPER_ADMIN chose their own password
      },
    });
  }

  // Two separate tenants to prove isolation + white-label theming.
  const acme = await prisma.company.upsert({
    where: { slug: "acme" },
    update: {},
    create: {
      name: "Acme Corp",
      slug: "acme",
      primaryColor: "#2E75B6",
      users: {
        create: [
          { email: "admin@acme.com", name: "Acme Admin", passwordHash: hash, role: "COMPANY_ADMIN" },
          { email: "editor@acme.com", name: "Acme Editor", passwordHash: hash, role: "EDITOR" },
          { email: "viewer@acme.com", name: "Acme Viewer", passwordHash: hash, role: "VIEWER" },
        ],
      },
    },
  });

  const globex = await prisma.company.upsert({
    where: { slug: "globex" },
    update: {},
    create: {
      name: "Globex SA",
      slug: "globex",
      primaryColor: "#C0392B",
      users: {
        create: [
          { email: "admin@globex.com", name: "Globex Admin", passwordHash: hash, role: "COMPANY_ADMIN" },
        ],
      },
    },
  });

  // A root folder + sample file for Acme.
  const folder = await prisma.folder.create({
    data: { companyId: acme.id, name: "Contracts" },
  });
  await prisma.file.create({
    data: {
      companyId: acme.id,
      folderId: folder.id,
      name: "NDA-template.pdf",
      storageKey: "acme/contracts/nda-template.pdf",
      mimeType: "application/pdf",
      size: 18234,
      reviewDueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  console.log("Seeded companies:", acme.slug, globex.slug);
  console.log("Super admin:     superadmin@docvault.app / SuperAdmin123!");
  console.log("Login with:      acme / admin@acme.com / password123");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

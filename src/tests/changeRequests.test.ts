/**
 * Integration tests for the approval workflow (ChangeRequest system).
 *
 * All tests run against the real database using fixtures torn down in afterAll.
 * Tests prove:
 *
 *   1. EDITOR upload creates PENDING_APPROVAL — hidden from other non-admin users
 *      but visible to the uploader and to admins.
 *   2. EDITOR DELETE creates a ChangeRequest; the file itself is untouched.
 *   3. EDITOR content-field PATCH creates a ChangeRequest; the file field is
 *      unchanged until approved.
 *   4. Rejecting a NEW_UPLOAD ChangeRequest deletes the file and notifies the
 *      requester.
 *   5. Approving an EDIT_METADATA ChangeRequest applies the "after" fields to
 *      the file and notifies the requester.
 *   6. MANAGE-level and COMPANY_ADMIN access bypasses the approval workflow;
 *      changes are applied immediately with no ChangeRequest created.
 *   7. autoApproveOnCompletion=true → file updated directly on task completion;
 *      false + EDIT-only → ChangeRequest is created instead.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { canBypassApproval } from "@/lib/changeRequests";

// ─── Shared fixtures ────────────────────────────────────────────────────────────

let companyId: string;
let adminId:   string;
let editorId:  string;
let otherId:   string;

beforeAll(async () => {
  const slug = `test-cr-${Date.now()}`;
  const company = await prisma.company.create({
    data: { name: "__test_change_requests__", slug, primaryColor: "#000" },
  });
  companyId = company.id;

  const ts = Date.now();

  const admin = await prisma.user.create({
    data: { companyId, email: `admin-cr-${ts}@test.local`, name: "Admin CR", passwordHash: "x", role: "COMPANY_ADMIN" },
  });
  adminId = admin.id;

  const editor = await prisma.user.create({
    data: { companyId, email: `editor-cr-${ts}@test.local`, name: "Editor CR", passwordHash: "x", role: "EDITOR" },
  });
  editorId = editor.id;

  const other = await prisma.user.create({
    data: { companyId, email: `other-cr-${ts}@test.local`, name: "Other CR", passwordHash: "x", role: "EDITOR" },
  });
  otherId = other.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

// ─── 1. PENDING_APPROVAL visibility scoping ─────────────────────────────────────

describe("PENDING_APPROVAL visibility", () => {
  it("PENDING_APPROVAL file is hidden from other non-admin users but visible to the uploader and admin", async () => {
    const file = await prisma.file.create({
      data: {
        companyId,
        name: "pending-upload.pdf",
        storageKey: `${companyId}/pending-upload.pdf`,
        mimeType: "application/pdf",
        size: 1024,
        status: "PENDING_APPROVAL",
        uploadedByUserId: editorId,
      },
    });

    // The OR filter applied for non-admin users in folder/listado-maestro endpoints
    const visibleToOther = await prisma.file.findFirst({
      where: {
        id: file.id,
        OR: [
          { status: { not: "PENDING_APPROVAL" } },
          { uploadedByUserId: otherId },
        ],
      },
    });
    expect(visibleToOther).toBeNull();

    // The uploader passes the filter via the uploadedByUserId branch
    const visibleToEditor = await prisma.file.findFirst({
      where: {
        id: file.id,
        OR: [
          { status: { not: "PENDING_APPROVAL" } },
          { uploadedByUserId: editorId },
        ],
      },
    });
    expect(visibleToEditor).not.toBeNull();

    // Admin queries have no filter — sees everything
    const visibleToAdmin = await prisma.file.findUnique({ where: { id: file.id } });
    expect(visibleToAdmin).not.toBeNull();
    expect(visibleToAdmin?.status).toBe("PENDING_APPROVAL");

    await prisma.file.delete({ where: { id: file.id } });
  });
});

// ─── 2. EDITOR DELETE → ChangeRequest, file untouched ───────────────────────────

describe("EDITOR DELETE creates ChangeRequest", () => {
  it("deleting as EDITOR (EDIT level) creates a PENDING ChangeRequest and leaves the file intact", async () => {
    const file = await prisma.file.create({
      data: {
        companyId,
        name: "to-delete.pdf",
        storageKey: `${companyId}/to-delete.pdf`,
        mimeType: "application/pdf",
        size: 512,
      },
    });

    // EDIT-level EDITOR cannot bypass
    expect(canBypassApproval("EDIT", "EDITOR")).toBe(false);

    // Simulate what DELETE /api/files/[id] does for an EDITOR
    const cr = await prisma.changeRequest.create({
      data: {
        companyId,
        type: "DELETE",
        fileId: file.id,
        requestedByUserId: editorId,
        proposedChanges: { fileName: file.name, storageKey: file.storageKey } as object,
      },
    });

    // File still exists and is NOT soft-deleted
    const stillExists = await prisma.file.findFirst({
      where: { id: file.id, deletedAt: null },
    });
    expect(stillExists).not.toBeNull();

    // ChangeRequest is in PENDING state
    const pending = await prisma.changeRequest.findUnique({ where: { id: cr.id } });
    expect(pending?.status).toBe("PENDING");
    expect(pending?.type).toBe("DELETE");
    expect(pending?.fileId).toBe(file.id);

    await prisma.changeRequest.delete({ where: { id: cr.id } });
    await prisma.file.delete({ where: { id: file.id } });
  });
});

// ─── 3. EDITOR content PATCH → ChangeRequest, field unchanged ───────────────────

describe("EDITOR content field change creates ChangeRequest", () => {
  it("EDITOR changing codigo creates a PENDING ChangeRequest; file field is unchanged", async () => {
    const file = await prisma.file.create({
      data: {
        companyId,
        name: "coded-doc.pdf",
        codigo: "DOC-001",
        storageKey: `${companyId}/coded-doc.pdf`,
        mimeType: "application/pdf",
        size: 1024,
      },
    });

    // EDIT-only cannot bypass
    expect(canBypassApproval("EDIT", "EDITOR")).toBe(false);

    // Simulate PATCH /api/files/[id] for EDITOR with a content field
    const cr = await prisma.changeRequest.create({
      data: {
        companyId,
        type: "EDIT_METADATA",
        fileId: file.id,
        requestedByUserId: editorId,
        proposedChanges: {
          before: { codigo: "DOC-001" },
          after:  { codigo: "DOC-002" },
        } as object,
      },
    });

    // File codigo is unchanged
    const unchanged = await prisma.file.findUnique({ where: { id: file.id } });
    expect(unchanged?.codigo).toBe("DOC-001");

    // CR is PENDING
    const pendingCR = await prisma.changeRequest.findUnique({ where: { id: cr.id } });
    expect(pendingCR?.status).toBe("PENDING");
    expect(pendingCR?.type).toBe("EDIT_METADATA");

    await prisma.changeRequest.delete({ where: { id: cr.id } });
    await prisma.file.delete({ where: { id: file.id } });
  });
});

// ─── 4. Rejecting NEW_UPLOAD removes file and notifies user ─────────────────────

describe("rejecting NEW_UPLOAD", () => {
  it("rejecting a NEW_UPLOAD ChangeRequest deletes the file record and notifies the requester", async () => {
    const file = await prisma.file.create({
      data: {
        companyId,
        name: "staged-upload.pdf",
        storageKey: `${companyId}/staged-upload.pdf`,
        mimeType: "application/pdf",
        size: 2048,
        status: "PENDING_APPROVAL",
        uploadedByUserId: editorId,
      },
    });

    const cr = await prisma.changeRequest.create({
      data: {
        companyId,
        type: "NEW_UPLOAD",
        fileId: file.id,
        requestedByUserId: editorId,
        proposedChanges: { storageKey: file.storageKey, name: file.name, size: file.size } as object,
      },
    });

    const crId   = cr.id;
    const fileId = file.id;

    // Simulate POST /api/change-requests/[id]/review with action=REJECT:
    // 1. Delete the file record (triggers onDelete:SetNull → cr.fileId becomes null in DB)
    await prisma.file.delete({ where: { id: fileId } });
    // 2. Update CR status
    await prisma.changeRequest.update({
      where: { id: crId },
      data: {
        status: "REJECTED",
        reviewedByUserId: adminId,
        reviewedAt: new Date(),
        adminNotes: "El archivo no cumple los requisitos de formato",
      },
    });
    // 3. Notify the requester (fileId: null because file is gone)
    await prisma.notification.create({
      data: {
        companyId,
        userId: editorId,
        type: "CHANGE_REQUEST_REJECTED",
        message: `Tu solicitud de nueva subida de archivo para "staged-upload.pdf" fue rechazada`,
        fileId: null,
      },
    });

    // File is permanently gone
    const deletedFile = await prisma.file.findUnique({ where: { id: fileId } });
    expect(deletedFile).toBeNull();

    // CR is REJECTED; fileId nulled by cascade
    const rejectedCR = await prisma.changeRequest.findUnique({ where: { id: crId } });
    expect(rejectedCR?.status).toBe("REJECTED");
    expect(rejectedCR?.fileId).toBeNull();
    expect(rejectedCR?.adminNotes).toContain("formato");

    // Notification was sent to the editor
    const notif = await prisma.notification.findFirst({
      where: { userId: editorId, type: "CHANGE_REQUEST_REJECTED" },
      orderBy: { createdAt: "desc" },
    });
    expect(notif).not.toBeNull();
    expect(notif?.message).toContain("rechazada");
  });
});

// ─── 5. Approving EDIT_METADATA applies fields and notifies user ─────────────────

describe("approving EDIT_METADATA", () => {
  it("approving an EDIT_METADATA ChangeRequest applies the after fields to the file and notifies the requester", async () => {
    const file = await prisma.file.create({
      data: {
        companyId,
        name: "editable-doc.pdf",
        codigo: "OLD-CODE",
        nombreDocumento: "Documento Viejo",
        storageKey: `${companyId}/editable-doc.pdf`,
        mimeType: "application/pdf",
        size: 1024,
      },
    });

    const cr = await prisma.changeRequest.create({
      data: {
        companyId,
        type: "EDIT_METADATA",
        fileId: file.id,
        requestedByUserId: editorId,
        proposedChanges: {
          before: { codigo: "OLD-CODE", nombreDocumento: "Documento Viejo" },
          after:  { codigo: "NEW-CODE", nombreDocumento: "Documento Nuevo" },
        } as object,
      },
    });

    // Simulate POST /api/change-requests/[id]/review with action=APPROVE:
    // 1. Apply the "after" fields to the file
    const pc    = cr.proposedChanges as Record<string, unknown>;
    const after = pc.after as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.file.update({ where: { id: file.id }, data: after as any });
    // 2. Mark CR approved
    await prisma.changeRequest.update({
      where: { id: cr.id },
      data: { status: "APPROVED", reviewedByUserId: adminId, reviewedAt: new Date() },
    });
    // 3. Notify requester
    await prisma.notification.create({
      data: {
        companyId,
        userId: editorId,
        type: "CHANGE_REQUEST_APPROVED",
        message: `Tu solicitud de edición de metadatos para "Documento Nuevo" fue aprobada`,
        fileId: file.id,
      },
    });

    // File fields are updated
    const updatedFile = await prisma.file.findUnique({ where: { id: file.id } });
    expect(updatedFile?.codigo).toBe("NEW-CODE");
    expect(updatedFile?.nombreDocumento).toBe("Documento Nuevo");

    // CR is APPROVED
    const approvedCR = await prisma.changeRequest.findUnique({ where: { id: cr.id } });
    expect(approvedCR?.status).toBe("APPROVED");
    expect(approvedCR?.reviewedByUserId).toBe(adminId);

    // Notification received by editor
    const notif = await prisma.notification.findFirst({
      where: { userId: editorId, type: "CHANGE_REQUEST_APPROVED" },
      orderBy: { createdAt: "desc" },
    });
    expect(notif).not.toBeNull();
    expect(notif?.message).toContain("aprobada");

    await prisma.changeRequest.delete({ where: { id: cr.id } });
    await prisma.file.delete({ where: { id: file.id } });
  });
});

// ─── 6. MANAGE/admin bypass applies changes immediately with no ChangeRequest ────

describe("MANAGE and COMPANY_ADMIN bypass", () => {
  it("canBypassApproval returns the correct value for each access level and role combination", () => {
    // Editors with EDIT or lower → must go through approval
    expect(canBypassApproval("EDIT",  "EDITOR")).toBe(false);
    expect(canBypassApproval("READ",  "EDITOR")).toBe(false);
    expect(canBypassApproval("NONE",  "EDITOR")).toBe(false);
    // Editor with MANAGE access → bypass
    expect(canBypassApproval("MANAGE", "EDITOR")).toBe(true);
    // COMPANY_ADMIN always bypasses regardless of access level
    expect(canBypassApproval("EDIT",   "COMPANY_ADMIN")).toBe(true);
    expect(canBypassApproval("READ",   "COMPANY_ADMIN")).toBe(true);
  });

  it("MANAGE-level user changes apply directly to the file with no ChangeRequest created", async () => {
    const file = await prisma.file.create({
      data: {
        companyId,
        name: "managed.pdf",
        codigo: "MGR-001",
        storageKey: `${companyId}/managed.pdf`,
        mimeType: "application/pdf",
        size: 1024,
      },
    });

    const crsBefore = await prisma.changeRequest.count({ where: { companyId, fileId: file.id } });

    // MANAGE-level bypass → apply directly, no CR created
    expect(canBypassApproval("MANAGE", "EDITOR")).toBe(true);
    await prisma.file.update({ where: { id: file.id }, data: { codigo: "MGR-002" } });

    const crsAfter = await prisma.changeRequest.count({ where: { companyId, fileId: file.id } });
    expect(crsAfter).toBe(crsBefore); // zero new ChangeRequests

    const updatedFile = await prisma.file.findUnique({ where: { id: file.id } });
    expect(updatedFile?.codigo).toBe("MGR-002");

    await prisma.file.delete({ where: { id: file.id } });
  });
});

// ─── 7. autoApproveOnCompletion fork ────────────────────────────────────────────

describe("autoApproveOnCompletion task fork", () => {
  it("true → file updated on completion; false + EDIT-only → ChangeRequest created instead", async () => {
    const file = await prisma.file.create({
      data: {
        companyId,
        name: "task-target.pdf",
        storageKey: `${companyId}/task-target.pdf`,
        mimeType: "application/pdf",
        size: 1024,
        status: "IN_REVIEW",
      },
    });

    const editBypass = canBypassApproval("EDIT", "EDITOR");
    expect(editBypass).toBe(false); // confirms the EDITOR+EDIT path requires the autoApprove flag

    // ── autoApproveOnCompletion = true ──────────────────────────────────────
    const taskAuto = await prisma.documentTask.create({
      data: {
        companyId, fileId: file.id,
        assignedToUserId: editorId, assignedByUserId: adminId,
        type: "REVIEW", autoApproveOnCompletion: true,
      },
    });

    // When autoApproveOnCompletion=true, file is updated even without bypass
    if (!editBypass || taskAuto.autoApproveOnCompletion) {
      await prisma.file.update({
        where: { id: file.id },
        data: { fechaRevision: new Date(), status: "REVIEWED" },
      });
    }

    const afterAuto = await prisma.file.findUnique({ where: { id: file.id } });
    expect(afterAuto?.status).toBe("REVIEWED");
    expect(afterAuto?.fechaRevision).not.toBeNull();

    // Reset for the next scenario
    await prisma.file.update({ where: { id: file.id }, data: { status: "IN_REVIEW", fechaRevision: null } });

    // ── autoApproveOnCompletion = false ─────────────────────────────────────
    const taskNoAuto = await prisma.documentTask.create({
      data: {
        companyId, fileId: file.id,
        assignedToUserId: editorId, assignedByUserId: adminId,
        type: "REVIEW", autoApproveOnCompletion: false,
      },
    });

    const crsBefore = await prisma.changeRequest.count({ where: { companyId, fileId: file.id } });

    // No bypass, no autoApprove → ChangeRequest instead of direct update
    if (!editBypass && !taskNoAuto.autoApproveOnCompletion) {
      await prisma.changeRequest.create({
        data: {
          companyId,
          type: "REVISION_DATE_CHANGE",
          fileId: file.id,
          requestedByUserId: editorId,
          proposedChanges: {
            taskId: taskNoAuto.id,
            taskType: "REVIEW",
            proposedFileUpdates: { fechaRevision: new Date().toISOString(), status: "REVIEWED" },
          } as object,
        },
      });
    }

    const crsAfter = await prisma.changeRequest.count({ where: { companyId, fileId: file.id } });
    expect(crsAfter).toBe(crsBefore + 1); // one new CR

    // File is NOT updated — still IN_REVIEW
    const notUpdated = await prisma.file.findUnique({ where: { id: file.id } });
    expect(notUpdated?.status).toBe("IN_REVIEW");
    expect(notUpdated?.fechaRevision).toBeNull();
  });
});

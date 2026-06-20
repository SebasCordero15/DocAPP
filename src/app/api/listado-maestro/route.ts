import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFileAccess, atLeast, isAdminRole } from "@/lib/permissions";

// GET /api/listado-maestro
// Returns company files the caller has at least READ access to,
// with their Listado Maestro metadata.  Supports filter query params.
export async function GET(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { companyId, userId, role } = session;

  const p = req.nextUrl.searchParams;
  const codigo            = p.get("codigo")?.trim() ?? "";
  const nombre            = p.get("nombre")?.trim() ?? "";
  const encargadoId       = p.get("encargadoId")?.trim() ?? "";
  const version           = p.get("version")?.trim() ?? "";
  const fechaEmisionFrom  = p.get("fechaEmisionFrom") ?? "";
  const fechaEmisionTo    = p.get("fechaEmisionTo") ?? "";
  const fechaRevisionFrom = p.get("fechaRevisionFrom") ?? "";
  const fechaRevisionTo   = p.get("fechaRevisionTo") ?? "";
  const fechaActFrom      = p.get("fechaActualizacionFrom") ?? "";
  const fechaActTo        = p.get("fechaActualizacionTo") ?? "";

  // Build Prisma where for filters that can be pushed to the DB
  // Permission filtering happens after fetch.
  const where: Record<string, unknown> = {
    companyId,
    deletedAt: null,
    // Non-admins cannot see pending-approval files uploaded by others
    ...(!isAdminRole(role) ? {
      OR: [
        { status: { not: "PENDING_APPROVAL" } },
        { uploadedByUserId: userId },
      ],
    } : {}),
    ...(codigo    ? { codigo:    { contains: codigo,    mode: "insensitive" } } : {}),
    ...(nombre    ? { OR: [
        { nombreDocumento: { contains: nombre, mode: "insensitive" } },
        { name:            { contains: nombre, mode: "insensitive" } },
      ] } : {}),
    ...(encargadoId ? { encargadoDocumentoId: encargadoId } : {}),
    ...(version   ? { versionStr: { contains: version, mode: "insensitive" } } : {}),
    ...(fechaEmisionFrom || fechaEmisionTo ? {
      fechaEmision: {
        ...(fechaEmisionFrom ? { gte: new Date(fechaEmisionFrom) } : {}),
        ...(fechaEmisionTo   ? { lte: new Date(fechaEmisionTo + "T23:59:59Z") } : {}),
      },
    } : {}),
    ...(fechaRevisionFrom || fechaRevisionTo ? {
      fechaRevision: {
        ...(fechaRevisionFrom ? { gte: new Date(fechaRevisionFrom) } : {}),
        ...(fechaRevisionTo   ? { lte: new Date(fechaRevisionTo + "T23:59:59Z") } : {}),
      },
    } : {}),
    ...(fechaActFrom || fechaActTo ? {
      fechaActualizacion: {
        ...(fechaActFrom ? { gte: new Date(fechaActFrom) } : {}),
        ...(fechaActTo   ? { lte: new Date(fechaActTo + "T23:59:59Z") } : {}),
      },
    } : {}),
  };

  const rawFiles = await prisma.file.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, mimeType: true, size: true, folderId: true,
      codigo: true, nombreDocumento: true, versionStr: true,
      fechaEmision: true, fechaRevision: true, fechaActualizacion: true,
      controlCambios: true,
      encargadoDocumentoId: true,
      encargadoDocumento: { select: { id: true, name: true, email: true } },
      folder: { select: { id: true, name: true } },
      createdAt: true, updatedAt: true,
    },
  });

  // Permission filtering
  let accessible = rawFiles;
  if (!isAdminRole(role)) {
    const levels = await Promise.all(
      rawFiles.map((f) => resolveFileAccess(userId, companyId, role, f.id))
    );
    accessible = rawFiles.filter((_, i) => atLeast(levels[i], "READ"));
  }

  // Also return the list of company users for the encargado filter dropdown
  const users = await prisma.user.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const files = accessible.map((f) => ({
    ...f,
    fechaEmision:        f.fechaEmision?.toISOString() ?? null,
    fechaRevision:       f.fechaRevision?.toISOString() ?? null,
    fechaActualizacion:  f.fechaActualizacion?.toISOString() ?? null,
    createdAt:           f.createdAt.toISOString(),
    updatedAt:           f.updatedAt.toISOString(),
  }));

  return NextResponse.json({ files, users });
}

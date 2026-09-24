import { NextResponse } from "next/server";
import { hashToken } from "@cim/core";
import { db, getReportFile, getReportShareLinkByToken } from "@cim/db";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

const EXTENSION: Record<"pdf" | "csv" | "xlsx", string> = {
  pdf: "pdf",
  csv: "csv",
  xlsx: "xlsx",
};

/**
 * docs/product/FEATURE_MATRIX.md P2 "sharing links" — deliberately
 * public and unauthenticated: this is the whole point of a share link
 * (ADR-001's documented exception for a by-design public entry point).
 * Rate-limited by IP the same way the invitation-accept route is (a
 * public token lookup with no login gate is exactly the kind of endpoint
 * brief §76 asks for this on) — a token space is astronomically large,
 * but "unguessable" isn't the same as "unlimited attempts is fine."
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = clientIpFrom(request);
  const rateLimit = await checkRateLimit(`shared-report:${ip}`, {
    limit: 30,
    windowSeconds: 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  const { token } = await params;
  const format = new URL(request.url).searchParams.get("format");
  if (format !== "pdf" && format !== "csv" && format !== "xlsx") {
    return NextResponse.json(
      { error: "format must be pdf, csv, or xlsx" },
      { status: 400 },
    );
  }

  const shared = await getReportShareLinkByToken(db, hashToken(token));
  if (!shared) {
    return NextResponse.json(
      { error: "This link is invalid, expired, or revoked" },
      { status: 404 },
    );
  }

  const file = await getReportFile(db, shared.reportRunId, format);
  if (!file) {
    return NextResponse.json({ error: "Report file not found" }, { status: 404 });
  }

  const filename = `${shared.reportName.replace(/[^a-z0-9-_]+/gi, "-")}.${EXTENSION[format]}`;
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(file.sizeBytes),
    },
  });
}

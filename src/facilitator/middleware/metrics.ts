import type { Request, Response, NextFunction } from "express";
import { parseHBD } from "../../types.js";

// ─── Metrics Store ──────────────────────────────────────────────────────────

export interface EndpointMetrics {
  requests: number;
  success: number;
  failures: number;
  totalLatencyMs: number;
}

export interface MetricsSnapshot {
  uptime: number;
  startedAt: string;
  totals: {
    requests: number;
    verifications: number;
    settlements: number;
    settlementsSuccess: number;
    settlementsFailed: number;
    hbdSettled: number;
    uniquePayers: number;
  };
  endpoints: Record<string, EndpointMetrics>;
  recentSettlements: SettlementRecord[];
}

export interface SettlementRecord {
  timestamp: string;
  payer: string;
  amount: string;
  txId: string;
  resource: string;
}

const MAX_RECENT = 50;

export class MetricsCollector {
  private startedAt = Date.now();
  private endpoints: Record<string, EndpointMetrics> = {};
  private hbdSettled = 0;
  private payers = new Set<string>();
  private recentSettlements: SettlementRecord[] = [];

  private getEndpoint(path: string): EndpointMetrics {
    if (!this.endpoints[path]) {
      this.endpoints[path] = { requests: 0, success: 0, failures: 0, totalLatencyMs: 0 };
    }
    return this.endpoints[path];
  }

  recordRequest(path: string, latencyMs: number, success: boolean): void {
    const ep = this.getEndpoint(path);
    ep.requests++;
    ep.totalLatencyMs += latencyMs;
    if (success) ep.success++;
    else ep.failures++;
  }

  recordSettlement(payer: string, amount: string, txId: string, resource: string): void {
    try {
      this.hbdSettled += parseHBD(amount);
    } catch {
      // ignore parse errors
    }
    this.payers.add(payer);
    this.recentSettlements.unshift({
      timestamp: new Date().toISOString(),
      payer,
      amount,
      txId,
      resource,
    });
    if (this.recentSettlements.length > MAX_RECENT) {
      this.recentSettlements.length = MAX_RECENT;
    }
  }

  snapshot(): MetricsSnapshot {
    const totals = {
      requests: 0,
      verifications: 0,
      settlements: 0,
      settlementsSuccess: 0,
      settlementsFailed: 0,
      hbdSettled: Math.round(this.hbdSettled * 1000) / 1000,
      uniquePayers: this.payers.size,
    };

    for (const [path, ep] of Object.entries(this.endpoints)) {
      totals.requests += ep.requests;
      if (path === "/verify") totals.verifications = ep.requests;
      if (path === "/settle") {
        totals.settlements = ep.requests;
        totals.settlementsSuccess = ep.success;
        totals.settlementsFailed = ep.failures;
      }
    }

    return {
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      startedAt: new Date(this.startedAt).toISOString(),
      totals,
      endpoints: { ...this.endpoints },
      recentSettlements: [...this.recentSettlements],
    };
  }
}

// ─── Express Middleware ─────────────────────────────────────────────────────

const EXCLUDED_PATHS = new Set(["/metrics", "/stats"]);

export function metricsMiddleware(collector: MetricsCollector) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (EXCLUDED_PATHS.has(req.path)) {
      next();
      return;
    }

    const start = Date.now();

    res.on("finish", () => {
      const latency = Date.now() - start;
      const success = res.statusCode >= 200 && res.statusCode < 400;
      collector.recordRequest(req.path, latency, success);
    });

    next();
  };
}

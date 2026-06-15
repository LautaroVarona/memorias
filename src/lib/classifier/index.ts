import type { CuentaNormalizada, TipoEmpresa } from "@/types/domain";
import { obtenerSaldoCuenta } from "@/lib/normalizers/cuentas";

interface Score {
  holding: number;
  comercial: number;
  industrial: number;
}

function abs(n: number): number {
  return Math.abs(n);
}

export function clasificarEmpresa(cuentas: CuentaNormalizada[]): TipoEmpresa {
  const scores: Score = { holding: 0, comercial: 0, industrial: 0 };

  const participaciones = abs(obtenerSaldoCuenta(cuentas, ["240", "241", "242", "250"]));
  const dividendos = abs(obtenerSaldoCuenta(cuentas, ["760"]));
  const compras = abs(obtenerSaldoCuenta(cuentas, ["600", "601", "602"]));
  const ventas = abs(obtenerSaldoCuenta(cuentas, ["700", "701", "705"]));
  const clientes = abs(obtenerSaldoCuenta(cuentas, ["430"]));
  const proveedores = abs(obtenerSaldoCuenta(cuentas, ["400"]));
  const stocks = abs(obtenerSaldoCuenta(cuentas, ["30", "31", "32", "33", "34", "35"]));
  const costesProduccion = abs(obtenerSaldoCuenta(cuentas, ["61", "71"]));

  if (participaciones > 10000) scores.holding += 3;
  if (dividendos > 5000) scores.holding += 2;
  if (ventas < compras * 0.3) scores.holding += 1;

  if (compras > 50000) scores.comercial += 2;
  if (ventas > 50000) scores.comercial += 3;
  if (clientes > 10000) scores.comercial += 1;
  if (proveedores > 10000) scores.comercial += 1;

  if (costesProduccion > 20000) scores.industrial += 3;
  if (stocks > 15000) scores.industrial += 2;
  if (compras > 30000 && stocks > 5000) scores.industrial += 1;

  const max = Math.max(scores.holding, scores.comercial, scores.industrial);
  if (max === 0) return "desconocido";
  if (scores.holding === max) return "holding";
  if (scores.industrial === max) return "industrial";
  return "comercial";
}

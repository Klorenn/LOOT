"use client";

import { createContext, useContext, useMemo } from "react";
import { configFor, injectMainnet, type MainnetPublic, type Net, type NetConfig } from "@/lib/network";

const Ctx = createContext<NetConfig | null>(null);

/** Red activa para los componentes cliente (también durante el SSR). La fija el layout con la cookie. */
export function NetworkProvider({ net, mainnet, children }: { net: Net; mainnet: MainnetPublic; children: React.ReactNode }) {
  injectMainnet(mainnet); // para clientCfg() en handlers y lib de navegador
  const value = useMemo(() => configFor(net, mainnet), [net, mainnet]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNet(): NetConfig {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNet() outside NetworkProvider");
  return v;
}

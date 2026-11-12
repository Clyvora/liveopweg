"use client";
import { useEffect, useState } from "react";

/** Only the open detail panel ticks each second; the whole map does not rerender with it. */
export function usePanelNow(initial:number) {
  const [time,setTime]=useState<number|null>(null);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState!=="hidden")setTime(Date.now());};
    const frame=requestAnimationFrame(refresh);
    const timer=setInterval(refresh,1000);
    document.addEventListener("visibilitychange",refresh);
    return()=>{cancelAnimationFrame(frame);clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};
  },[]);
  return time??initial;
}

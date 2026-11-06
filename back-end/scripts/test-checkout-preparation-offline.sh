#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "$(uname -s)" != Darwin ] || ! command -v sandbox-exec >/dev/null; then
  echo 'OS network denial is required to run the actual checkout route tests.' >&2
  exit 1
fi
node_path="$(command -v node)"
# Prove the profile blocks loopback and outbound TCP before executing route code.
env -i PATH="$PATH" /usr/bin/sandbox-exec -p '(version 1) (allow default) (deny network*)' "$node_path" -e 'const net=require("node:net"); Promise.all(["127.0.0.1","192.0.2.1"].map(host=>new Promise((resolve,reject)=>{const s=net.connect(443,host); s.setTimeout(1500,()=>reject(Error("network denial not proven: timeout"))); s.on("connect",()=>reject(Error("network unexpectedly connected"))); s.on("error",e=>e.code === "EPERM" || e.code === "EACCES" ? resolve() : reject(e));}))).catch(e=>{console.error(e);process.exitCode=1});'
exec env -i PATH="$PATH" /usr/bin/sandbox-exec -p '(version 1) (allow default) (deny network*)' "$node_path" --import tsx scripts/test-checkout-preparation-route.ts

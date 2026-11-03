import fs from 'node:fs';
import { ID, sha } from './authorization.mjs';
export function verifyFrozen(directory) {
  const packetBytes = fs.readFileSync(directory + '/PACKET_NOT_AUTHORIZED.json');
  const bindingBytes = fs.readFileSync(directory + '/EXECUTION_BINDING.json');
  const packet = JSON.parse(packetBytes), binding = JSON.parse(bindingBytes);
  if (packet.authorizationId !== ID || binding.authorizationId !== ID || sha(packetBytes) !== binding.packetSha256
    || packet.networkBoundary !== 'MONITOR_ONLY' || packet.maxAdditionalCostUSD !== 0 || packet.liveRequestsAuthorized !== false
    || packet.workerPreDispatchControl !== false || packet.hardNetworkCap !== false) throw Error('BINDING_INVALID');
  for (const file of binding.files) if (sha(fs.readFileSync(file.path)) !== file.sha256) throw Error('FROZEN_FILE_DRIFT');
  if (process.execPath.toLowerCase().replaceAll('\\', '/') !== binding.nodePath.toLowerCase().replaceAll('\\', '/')) throw Error('NODE_IDENTITY_DRIFT');
  const contract = fs.readFileSync(directory + '/../CONTRACT_NOT_AUTHORIZED.md');
  if (sha(contract) !== packet.contractSha256) throw Error('CONTRACT_DRIFT');
  return { bindingHash: sha(bindingBytes), packetHash: sha(packetBytes), packet, binding };
}

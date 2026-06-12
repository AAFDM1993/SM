export function generarHashSHA256(input, services) {
  const rawHash = services.Utilities.computeDigest(services.Utilities.DigestAlgorithm.SHA_256, input);
  let txtHash = '';
  for (let i = 0; i < rawHash.length; i++) {
    let hashVal = rawHash[i];
    if (hashVal < 0) hashVal += 256;
    if (hashVal.toString(16).length === 1) txtHash += '0';
    txtHash += hashVal.toString(16);
  }
  return txtHash;
}

export function generarSalt(services) {
  return services.Utilities.getUuid().replace(/-/g, '');
}

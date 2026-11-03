import path from 'node:path';

export function resolveR2WorkerRuntime(source,importer) {
  const normalized=importer?.replaceAll('\\','/').split('?')[0];
  // CopyObject has an XML response. The browser parser needs DOMParser, which
  // Workers does not expose; the SDK's plain-JS parser has no Node dependencies.
  if(/^\.\/xml-parser(?:\.js)?$/.test(source)&&
    normalized?.endsWith('/node_modules/@aws-sdk/xml-builder/dist-es/index.js')) {
    return path.posix.join(path.posix.dirname(normalized),'xml-parser.js');
  }
  // S3's successful-response middleware replays even HEAD bodies. Its Node
  // stream cannot be consumed by the Worker's browser stream collector.
  if(/^\.\.\/to-stream\/toStream(?:\.js)?$/.test(source)&&
    normalized?.endsWith('/node_modules/@aws-sdk/middleware-sdk-s3/dist-es/submodules/s3/middleware-throw-200-exceptions/throw-200-exceptions.js')) {
    return path.posix.join(path.posix.dirname(normalized),'../to-stream/toStream.browser.js');
  }
  if(!/^\.\/runtimeConfig(?:\.js)?$/.test(source)||
    !normalized?.endsWith('/node_modules/@aws-sdk/client-s3/dist-es/S3Client.js'))return null;
  return path.posix.join(path.posix.dirname(normalized),'runtimeConfig.browser.js');
}

export function r2WorkerSdkRuntime() {
  return {
    name:'r2-worker-sdk-runtime',apply:'build',enforce:'pre',
    // Workers resolve AWS core browser exports; the S3 runtime must agree.
    resolveId:resolveR2WorkerRuntime,
  };
}

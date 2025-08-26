import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

const GRPC_SERVER_URL = process.argv[3];

let client: any = null;

export function getClient() {
  if (!client) {
    const PROTO_PATH = path.join(process.cwd(), "protos", "agent.proto");
    const packageDef = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const protoDescriptor = grpc.loadPackageDefinition(packageDef) as any;
    const AgentService = protoDescriptor.agent.AgentService;

    client = new AgentService(
      GRPC_SERVER_URL || "localhost:50051",
      grpc.credentials.createInsecure()
    );
  }
  return client;
}

export function closeClient() {
  if (client) {
    client.close();
    client = null;
  }
}

export function waitForServerReady(timeout = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const clientInstance = getClient();
    clientInstance.waitForReady(deadline, (err?: Error) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

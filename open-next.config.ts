import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Every page is dynamic (it reads the signed-in desk), so no incremental cache is configured.
export default defineCloudflareConfig();

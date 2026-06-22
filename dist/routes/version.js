import { versionInfo } from '../version.js';
export async function versionRoute(app) {
    app.get('/version', async () => {
        return versionInfo();
    });
}

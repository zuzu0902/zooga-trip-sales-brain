export async function healthRoute(app) {
    app.get('/health', async () => {
        return {
            ok: true,
            service: 'community-intelligence-railway-brain',
            status: 'healthy',
            now: new Date().toISOString(),
        };
    });
}

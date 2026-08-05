import { render } from 'preact';
import { App } from './app';
import { initializeHost } from './lib/host';
import './styles.css';

function StartupError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : '插件运行时启动失败。';
  return (
    <main class="startup-error" role="alert">
      <section>
        <span class="eyebrow">运行环境不兼容</span>
        <h1>需要 BJTU MIS 1.4.0</h1>
        <p>{message}</p>
        <p>请确认当前插件由“高级 / 开发者导入”安装，并运行在 BJTU MIS 1.4.0 或更高版本中。</p>
      </section>
    </main>
  );
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('缺少插件挂载节点。');
  try {
    const mock = import.meta.env.DEV && new URLSearchParams(location.search).get('mock') === '1'
      ? (await import('./lib/mock-host')).createMockHostSdk()
      : undefined;
    await initializeHost(mock);
    render(<App />, root);
  } catch (error) {
    render(<StartupError error={error} />, root);
  }
}

void bootstrap();

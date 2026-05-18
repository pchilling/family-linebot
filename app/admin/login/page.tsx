import { signIn } from '../actions';

const input: React.CSSProperties = {
  width: '100%',
  padding: 8,
  fontSize: 14,
  border: '1px solid #ccc',
  borderRadius: 4,
  boxSizing: 'border-box',
};
const btn: React.CSSProperties = {
  width: '100%',
  padding: 10,
  background: '#000',
  color: '#fff',
  border: 0,
  cursor: 'pointer',
  fontSize: 14,
  borderRadius: 4,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main
      style={{
        maxWidth: 360,
        margin: '80px auto',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 24 }}>Admin 登入</h1>
      {params.error && (
        <div
          style={{
            background: '#fee',
            padding: 10,
            marginBottom: 16,
            color: '#a00',
            fontSize: 14,
            borderRadius: 4,
          }}
        >
          {decodeURIComponent(params.error)}
        </div>
      )}
      <form action={signIn}>
        <div style={{ marginBottom: 14 }}>
          <label
            htmlFor="email"
            style={{ display: 'block', marginBottom: 4, fontSize: 13 }}
          >
            Email
          </label>
          <input id="email" name="email" type="email" required style={input} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label
            htmlFor="password"
            style={{ display: 'block', marginBottom: 4, fontSize: 13 }}
          >
            密碼
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            style={input}
          />
        </div>
        <button type="submit" style={btn}>
          登入
        </button>
      </form>
    </main>
  );
}

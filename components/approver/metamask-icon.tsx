/** Official MetaMask fox; decorative because the adjacent button names the action. */
export function MetaMaskIcon({ size = 24 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="metamask-icon"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        background: 'url("/wallets/metamask.svg") center / contain no-repeat',
      }}
    />
  );
}

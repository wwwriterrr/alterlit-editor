import { useState } from 'react';

/** Набор эмодзи вместо плагина TinyMCE: самые ходовые, по группам, без внешних библиотек. */
const GROUPS: { title: string; icon: string; list: string }[] = [
  { title: 'Лица', icon: '😀', list: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 🤡 👻 👽 🤖 💩' },
  { title: 'Жесты', icon: '👍', list: '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐 🖖 👋 🤝 🙏 👏 🙌 👐 🤲 💪 ✍️ 💅 👀 👁 🧠 👄 💋' },
  { title: 'Сердца', icon: '❤️', list: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 ⚡ ☀️ 🌙 🌈 ☁️ ❄️ ☔' },
  { title: 'Природа', icon: '🌿', list: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦉 🦋 🐌 🐞 🐢 🐍 🐙 🐟 🐬 🐳 🌸 🌹 🌺 🌻 🌼 🌷 🌱 🌿 🍀 🍁 🍂 🍃 🌲 🌳 🌵' },
  { title: 'Еда', icon: '🍎', list: '🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥝 🍅 🥑 🥕 🌽 🍞 🧀 🍳 🥞 🍔 🍟 🍕 🌭 🥪 🍝 🍜 🍣 🍰 🎂 🍫 🍬 🍭 🍩 🍪 ☕ 🍵 🍺 🍻 🥂 🍷 🥃 🍸' },
  { title: 'Предметы', icon: '📚', list: '📚 📖 ✏️ 🖋 📝 📌 📎 ✂️ 📅 ⏰ ⌛ 💡 🔑 🔒 🎁 🎈 🎉 🎊 🎄 🎃 🎵 🎶 🎸 🎹 🎤 🎬 📷 📱 💻 ⚽ 🏆 🥇 🚀 ✈️ 🚗 🏠 ⛪ 🗿 💰 💎 ⚖️ ⚠️ ❓ ❗ ✅ ❌' },
];

export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [tab, setTab] = useState(0);
  return (
    <div className="pe-emoji">
      <div className="pe-emoji-tabs" role="tablist">
        {GROUPS.map((g, i) => (
          <button
            key={g.title}
            type="button"
            role="tab"
            aria-selected={tab === i}
            title={g.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTab(i)}
          >
            {g.icon}
          </button>
        ))}
      </div>
      <div className="pe-emoji-grid" role="tabpanel" aria-label={GROUPS[tab].title}>
        {GROUPS[tab].list.split(' ').map((e) => (
          <button key={e} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

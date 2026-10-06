import type { BrainContext } from "./index";
import { chineseReply, isChinese } from "../planner/language";

export function basicReply(context: BrainContext): string {
  const { player, memory } = context;
  const text = context.text
    .trim()
    .replace(/[.!?。！？]+$/, "")
    .toLowerCase();
  const zh = isChinese(text);
  if (/^(thanks|thank you|谢谢(你)?|多谢)$/.test(text))
    return zh
      ? "不客气。下一趟想去哪里？"
      : "You're welcome. Where shall we go next?";
  if (/^(bye|goodbye|再见|拜拜)$/.test(text))
    return zh
      ? "下次一起玩。离开前可以说‘停下’，让我结束当前任务。"
      : "See you next time. Say stop before leaving to end my current task.";
  if (/^(what can you do|how do i play|你能做什么|你会什么|怎么玩)$/.test(text))
    return zh
      ? "可以一起走、采集附近资源、交还物品或保护你。试试‘跟着我’、‘收集 橡木 3’；用‘状态’和‘背包’查看进度，‘停下’结束任务。"
      : "I can follow, gather nearby resources, share items or guard you. Try follow me or collect oak_log 3; status and inventory show progress, and stop ends a task.";
  if (
    /^(what did we do last time|what did we do together|上次一起做了什么|我们做过什么)$/.test(
      text,
    )
  ) {
    const events = memory.events
      .slice(-3)
      .map((event) => (zh ? chineseReply(event.text) : event.text));
    return events.length
      ? `${zh ? "最近保存的合作记录：" : "Recent saved events: "}${events.join(zh ? "；" : "; ")}`
      : zh
        ? "还没有保存的合作记录。先一起收集点材料？"
        : "No shared events saved yet. Shall we gather some materials?";
  }
  if (
    /^(what do i like|do you remember my preferences|你记得我的偏好吗|我喜欢什么)$/.test(
      text,
    )
  )
    return memory.preferences.length
      ? `${zh ? "你主动告诉过我：" : "You told me: "}${memory.preferences.slice(-3).join(zh ? "；" : "; ")}`
      : zh
        ? "你还没告诉我偏好。可以说‘记住 我喜欢探索矿洞’，以后再来问我。"
        : "No preferences saved yet. Try remember I like exploring caves, then ask me again.";
  if (
    /^(what should we do today|what next|what shall we do|今天(玩|做)什么|接下来做什么|有什么建议)$/.test(
      text,
    )
  ) {
    const preference = memory.preferences.at(-1);
    const mining =
      preference &&
      /min(?:e|ing)|cave|explor|挖矿|矿洞|探索/i.test(preference) &&
      !/不喜欢|不想|不要|讨厌|avoid|dislike|hate|don['’]t|do not/i.test(
        preference,
      );
    const suggestion = mining
      ? zh
        ? "可以一起探索矿洞。先准备镐和火把，再叫我‘跟着我’；需要时说‘保护我’。"
        : "We could explore a cave. Bring a pickaxe and torches, then say follow me; protect me starts guarding."
      : zh
        ? "先收集一点木材怎么样？附近有橡木的话，可以叫我‘收集 橡木 3’，再用‘给我 橡木 3’拿回来。"
        : "How about gathering wood? If oak is nearby, say collect oak_log 3, then give me oak_log 3 to get it back.";
    return `${preference ? `${zh ? "我记得你说过：" : "I remember you said: "}${preference}${zh ? "。" : ". "}` : ""}${suggestion}${zh ? "这只是建议，还没有开始执行。" : "This is a suggestion; I haven't started an action."}`;
  }
  if (/^(hello|hi|hey|你好|嗨|在吗)$/.test(text))
    return zh
      ? `我在，${player}。今天想一起做什么？`
      : `I'm here, ${player}. What shall we do today?`;
  return zh
    ? `我在，${player}。基础聊天目前能回答玩法、偏好和近期合作记录。自由聊天可以接入模型；要开始行动，请说‘跟着我’、‘收集 橡木 3’或‘保护我’。`
    : `I'm here, ${player}. Basic chat covers commands, saved preferences and recent events. A model can add free-form conversation; say follow me, collect oak_log 3 or protect me to start an action.`;
}

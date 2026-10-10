// Scriptable stand-in for callLLM. Records every call so tests can inspect messages.
// `bot(userMessage, password)` and `judge(prompt)` return the content string, or throw.
export function createFakeLlm({ bot, judge } = {}) {
  const calls = [];
  const llm = async (req) => {
    calls.push(req);
    const isJudge = req.messages.length === 1;
    if (isJudge) {
      const content = judge ? await judge(req.messages[0].content) : '{"leak": false, "reason": "ok"}';
      return { content, model: 'fake/judge-1' };
    }
    const system = req.messages[0].content;
    const password = /The secret password is:? (\w+)/.exec(system)[1];
    const content = bot ? await bot(req.messages[1].content, password) : 'Greetings, traveler.';
    return { content, model: 'fake/bot-1' };
  };
  llm.calls = calls;
  return llm;
}

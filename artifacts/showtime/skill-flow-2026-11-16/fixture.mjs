import { setTimeout as wait } from 'node:timers/promises';

const origin = 'http://127.0.0.1:5189';
async function api(path, body, cookie) {
  const response = await fetch(origin + '/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) throw new Error(path + ': ' + response.status);
  return { data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const { cookie } = await api('/local', {
  token: '658bf96303360011b3cda74eeda6186ed77b7059493233540eda3993220ae5a4',
});
const { data } = await api('/access-code', null, cookie);
if (process.argv[2] === 'code') {
  console.log(data.code);
} else {
  const name = process.argv[2];
  for (let attempt = 0; attempt < 2400; attempt++) {
    const { data: state } = await api('/state', null, cookie);
    const student = state.people.find(person => person.name === name);
    if (student?.soft) {
      const high = student.soft.indexOf(Math.max(...student.soft));
      const low = student.soft.indexOf(Math.min(...student.soft));
      const fall = high === low ? (low + 3) % student.soft.length : high;
      for (const [index, score] of [[low, 92], [fall, 18]]) {
        await api('/people/' + student.id + '/score', { key: 'soft', index, score }, cookie);
      }
      break;
    }
    await wait(125);
  }
}

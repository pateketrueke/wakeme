const hd = require('humanize-duration')

const { JSONPath } = require('jsonpath-plus')
const { Transform } = require('stream');

const queries = process.argv.slice(2).filter(x => x.charAt() !== '-');
const buffer = [];

function sum(data) {
  return hd(data.reduce((prev, cur) => prev + cur, 0));
}

function keys(data, out = []) {
  if (typeof data !== 'object') {
    return [];
  }

  if (Array.isArray(data)) {
    Array.prototype.concat.apply([], data.map(x => keys(x, out)));
    return out;
  }

  Object.keys(data).forEach(k => {
    if (!out.includes(k) && typeof data[k] !== 'object') {
      out.push(k);
    }

    keys(data[k], out);
  });

  return out;
}

process.stdin.pipe(new Transform({
  transform(entry, enc, ok) {
    const lines = Buffer.from(entry, enc).toString().trim().split('\n');

    lines.map(x => x.trim()).forEach(line => {
      if (line.charAt() === '{' && line.charAt(line.length - 1) === '}') {
        buffer.push(JSON.parse(line));
      }
    });

    ok();
  }
}).on('finish', () => {
  const all = keys(buffer);

  if (!queries.length) {
    console.log(all.sort().join('\n'));
    return;
  }

  queries.forEach(q => {
    let found = q;

    if (q.includes('_')) {
      found = all.find(x => x.includes(q.replace('_', '')));
    }

    const data = JSONPath(`*..[${found}]`, buffer);

    let result = 'N/A';

    switch (found) {
      case 'date':
        result = hd(new Date(data[0][1]) - new Date(data[data.length - 1][0]));
        break;

      default:
        result = sum(data);
        break;
    }

    console.log(`\u001b[37;100m ${found} \u001b[0m`, result);
  });
})).pipe(process.stdout);

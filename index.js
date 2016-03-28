'use strict'

const assign = Object.assign


module.exports = sqleton


function all(db, query, params) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) return reject(err)
      resolve(rows)
    })
  })
}

function keys(db, ts) {
  return Promise.all(ts.map(table =>
    all(db, `PRAGMA foreign_key_list('${table.name}')`)
      .then(fk => { table.fk = fk })
      .then(() => table)))
}

function columns(db, ts) {
  return Promise.all(ts.map(table =>
    all(db, `PRAGMA table_info('${table.name}')`)
      .then(cs => { table.columns = cs })
      .then(() => table)))
}

function tables(db) {
  return all(db, 'SELECT name FROM sqlite_master WHERE type = "table"')
    .then(ts => columns(db, ts))
    .then(ts => keys(db, ts))
}


function quote(value) {
  return (value[0] === '<') ? `<${value}>` : `"${value}"`
}

function attr(attrs, sep) {
  return Object
    .keys(attrs)
    .map(prop => `${prop}=${quote(attrs[prop])}`)
    .join(sep || ', ')
}

function tag(name, content, options) {
  return (options) ?
    `<${name} ${attr(options, ' ')}>${content}</${name}>` :
    `<${name}>${content}</${name}>`
}

function font(content, options) {
  return tag('font', content, options)
}

function b(content, options) {
  return font(tag('b', content), assign({}, options))
}

function i(content, options) {
  return font(tag('i', content), assign({ color: 'grey60' }, options))
}

function td(content, options) {
  return tag('td', content, assign({
    align: 'left'
  }, options))
}

function tr(tds) {
  return tag('tr', tds.map(args => td(...args)).join(''))
}

function tb(trs, options) {
  return tag('table', trs.map(args => tr(...args)).join(''), assign({
    border: 0, cellspacing: 0.5
  }, options))
}

function head(table) {
  return tb([[[
    [b(table.name, { 'point-size': 11 }), { height: 24, valign: 'bottom' }]
  ]]])
}

function type(t) {
  return (t || 'none').toLowerCase()
}

function cols(column) {
  return [[[`${column.name}${column.pk ? '* ' : ' '}${i(type(column.type))}`]]]
}

function body(table) {
  return tb(table.columns.map(cols), { width: 134 })
}

function label(table) {
  return `${head(table)}|${body(table)}`
}

function edge(table, fk, options) {
  let labels = options['edge-lables'] ?
    { taillabel: fk.from, headlabel: fk.to } : {}

  return `${table.name} -> ${fk.table} [${attr(labels)}];`
}

function node(table) {
  let options = { label: label(table) }
  return `${table.name} [${attr(options)}];`
}

function digraph(db, stream, options) {
  return new Promise((resolve, reject) => {
    stream.write(`digraph ${db.name} {\n`)
    stream.write('  rankdir="LR";\n')
    stream.write('  ranksep="1.5";\n')
    stream.write('  nodesep="1.4";\n')
    stream.write('  concentrate="true";\n')
    stream.write('  pad="0.4,0.4";\n')
    stream.write('  fontname="Helvetica";\n')
    stream.write('  fontsize="10";\n')
    stream.write(`  label=<${b(options.t || db.filename)}>;\n`)

    stream.write(`  node[${attr({
      shape: 'Mrecord',
      fontsize: 10,
      fontname: 'Helvetica',
      margin: '0.07,0.04',
      penwidth: '1.0'
    })}];\n`)

    stream.write(`  edge[${attr({
      arrowsize: '0.8',
      fontsize: 6,
      style: 'solid',
      penwidth: '0.9',
      fontname: 'Helvetica',
      labelangle: 33,
      labeldistance: '2.0'
    })}];\n`)

    stream.write('  graph [overlap=false];\n')

    return tables(db)
      .then(ts => {
        for (let table of ts) {
          stream.write(`  ${node(table)}\n`)
        }

        for (let table of ts) {
          for (let fk of table.fk) {
            stream.write(`  ${edge(table, fk, options)}\n`)
          }
        }

        return ts
      })
      .then(() => { stream.write('}\n') })
      .then(resolve, reject)
  })
}

function sqleton(db, stream, options, cb) {
  const promise =  new Promise((resolve, reject) => {
    digraph(db, stream, options).then(resolve, reject)
  })

  if (cb) {
    promise.then(cb).catch(cb)
  }

  return promise
}

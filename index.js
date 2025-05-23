#!/usr/bin/env node
const compiler = require('vue-template-compiler');
const prettier = require('prettier');
const csstree = require('css-tree');
const babelParser = require('@babel/parser');
const babelGenerator = require('@babel/generator').default;
const VISITOR_KEYS = require('@babel/types').VISITOR_KEYS;
const path = require('path');
const fs = require('fs');
// Funcs
const testfile = "acquista"
const quoteBindedAttrs = true;
const useShortBinds = true;
let codice
function getincludes() {
  let tm = fs.readFileSync('convert/imports.js').toString().split('\n');
  let out = {}
  for (var t of tm) {
    let rr = /import\s+(\w+)\s+from\s+"(.+)?.vue/i.exec(t);
    if (rr) {
      out[camelToKebab(rr[1])] = rr[2].replace('@inc/', '$prj/').replace('@', '$');
    }
  }
  return out;
}

function camelToKebab(str) {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')  // inserisce un trattino tra minuscole/numero e maiuscole
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2') // gestisce casi come "XMLHttpRequest"
    .toLowerCase();
}
function kebabToPascal(str) {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
function parseouttemplate(data) {

  let tt = []
  let tik = {}
  let ti = []
  for (; ;) {
    let rr = /(<\/?)([\w\-]+)/im.exec(data);
    if (rr) {
      tt.push(data.slice(0, rr.index));
      tt.push(rr[1]);
      let kk = rr[2];
      if (kk.startsWith('icon-')) {
        // console.log(kk);
        if (!tik['ICO']) {
          tik['ICO'] = true;
          ti.unshift(`import Icon from '$base/Icon.svelte'`);
        }
        tt.push('Icon')
        if (!rr[1].includes('/')) {
          tt.push(` local img="${camelToKebab(kk.slice(5))}" `)
        }
      } else {
        let d = keys[kk];
        let kp = kebabToPascal(kk)
        if (d) {

          if (!tik[kk]) {
            tik[kk] = true;
            ti.push(`import ${kp} from '${d}.svelte'`);
          }
          tt.push(kp);
        } else {
          tt.push(rr[2])
        }
      }
      data = data.slice(rr.index + rr[0].length);

    } else {
      break;
    }
  }


  ti.unshift(`import { user, goto, bus, PP, post, config, setStorage, isauth } from '$lib/post.js';
import { createEventDispatcher, tick, onMount, onDestroy } from 'svelte';`);
  ti.push(`const emit = createEventDispatcher();`);

  tt.push(data);
  let codice = tt.join('');
  codice = codice.replace(/on\:([\w\.]+)\s*="{([^]*?)\}\"/gim, (all, p1, p2) => {
    return `on:${p1}={(e)=>{${p2.replaceAll('$event', 'e.detail')}}}`
  })
    .replace(/"{([^]*?)}"/gim, (all, p1) => {
      return `{${p1}}`
    })
    .replace(/v-model\s*=\s*"([^]*?)"/gim, (all, p1) => {
      return `bind:value={${p1}}`
    })



  return { codice, includes: ti.join('\n') }
}

function processTemplateExpression(expr) {
  // to do: transform $event -> event
  return expr; // for now
}

function processTemplateNode(node, output, depth, indent) {
  switch (node.type) {
    case 1: // Tag
      if (node['for']) {
        output.push(`${indent.repeat(depth)}{#each ${processTemplateExpression(node['for'])} as ${node.alias}${node.iterator1 ? ', ' + node.iterator1 : ''}}\n`);
        depth++;
      }

      if (node['if']) {
        output.push(`${indent.repeat(depth)}{#if ${processTemplateExpression(node['if'])}}\n`);
        depth++;
      } else
        if (node['else']) {
          output.push(`${indent.repeat(depth)}{:else}\n`);
          depth++;
        } else
          if (node['elseif']) {
            output.push(`${indent.repeat(depth)}{:else if ${processTemplateExpression(node['elseif'])}}\n`);
            depth++;
          }

      output.push(`${indent.repeat(depth)}<${node.tag}`);

      let attrs = [];
      let vHtml = null;
      for (let attr in node.attrsMap) {
        if (['v-if', 'v-else', 'v-else-if', 'v-for'].includes(attr)) {
          continue;
        }
        if (attr === 'v-html') {
          vHtml = node.attrsMap[attr];
        } else
          if (attr[0] === ':' || attr.startsWith('v-bind:')) {
            let key = attr.substr(attr[0] === ':' ? 1 : 7);
            if (key === node.attrsMap[attr] && useShortBinds) {
              attrs.push(`{${key}}`);
            } else {
              attrs.push(`${key}=${quoteBindedAttrs ? '"' : ''}{${processTemplateExpression(node.attrsMap[attr])
                }}${quoteBindedAttrs ? '"' : ''}`);
            }
          } else
            if (attr[0] === '@' || attr.startsWith('v-on:')) {
              let key = attr.substr(attr[0] === '@' ? 1 : 5);
              attrs.push(`on:${key}=${quoteBindedAttrs ? '"' : ''}{${processTemplateExpression(node.attrsMap[attr])
                }}${quoteBindedAttrs ? '"' : ''}`);
            } else {
              attrs.push(`${attr}="${node.attrsMap[attr]}"`);
            }
      }
      if (attrs.length) {
        output.push(` ${attrs.join(`\n${indent.repeat(depth)}${' '.repeat(node.tag.length + 2)}`)}`);
      }

      if (!node.children.length && vHtml !== null) {
        output.push('/>\n');
      } else {
        output.push('>\n');
        if (vHtml !== null) {
          output.push(`${indent.repeat(depth + 1)}{@html ${processTemplateExpression(vHtml)}}\n`);
          if (node.children.length) {
            console.warn(`found a node with children directive: will be ignored!`);
          }
        } else {
          for (let child of node.children) {
            processTemplateNode(child, output, depth + 1, indent);
          }
        }
        output.push(`${indent.repeat(depth)}</${node.tag}>\n`);
      }

      if (node.ifConditions && node.ifConditions.length > 1) {
        depth--;
        for (let i = 1; i < node.ifConditions.length; i++) {
          processTemplateNode(node.ifConditions[i].block, output, depth, indent);
        }
        depth++;
      }
      if (node['if']) {
        depth--;
        output.push(`${indent.repeat(depth)}{/if}\n`);
      }

      if (node['for']) {
        depth--;
        output.push(`${indent.repeat(depth)}{/each}\n`);
      }
      break;
    case 2: // Dynamic text
      output.push(indent.repeat(depth), node.tokens.map(token => {
        if (typeof token === 'string') {
          return token;
        } else {
          return `{${token['@binding']}}`;
        }
      }).join('').trim(), '\n');
      break;
    case 3: // Static text
      const text = node.text.trim();
      if (text.length) {
        output.push(text);
      }
      break;
    default:
      console.error(`Unknown node in template AST`, node);
      process.exit();
  }
}

function processScriptNode(node, toplevel) {
  // TODO: convert $set to assignment
  if (!node) {
    return node;
  }

  if (node.type === 'MemberExpression' && node.object.type === 'ThisExpression') { // this.something
    node = node.property;
  }

  if (node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'FunctionExpression' &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'bind' &&
    node.arguments.length === 1 &&
    node.arguments[0].type === 'ThisExpression') { // function() {}.bind(this)
    // Remove bind and enter
    node = node.callee.object;
  } else
    if (!toplevel && (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression')) {
      return node;
    }

  // Visit children

  if (!(node.type in VISITOR_KEYS)) {
    console.warning(`unknown node type, unable to visit childs.`);
    return node;
  }

  for (let key of VISITOR_KEYS[node.type]) {
    if (!(key in node)) {
      continue;
    }
    const val = node[key];
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        val[i] = processScriptNode(val[i]);
      }
    } else {
      node[key] = processScriptNode(val);
    }
  }

  return node;
}

function unwrapFunctionBody(node) {
  if (node.body.type === 'BlockStatement') {
    return node.body.body.map((child) => {
      return babelGenerator(processScriptNode(child)).code
    }).join('\n');
  }

  return babelGenerator(processScriptNode(prop.body)).code;
}

// ---------------------------------------------------- START -----------------------------------------------
// legge tutti i nomi dei componenti da sostituire con i nomi di svelte!
const keys = getincludes();

function parseinputPath(inputPath) {

  let outputPath = inputPath.replace('.vue', '.svelte');
  let inputContent;

  try {
    var data = fs.readFileSync(inputPath, 'utf8');
    inputContent = data.toString();
  } catch (e) {
    console.error(`Error while reading file`, inputPath);
    process.exit(1);
  }

  const sfc = compiler.parseComponent(inputContent);
  let output = [];

  const HOOKS = {
    mounted: 'onMount',
    beforeUpdate: 'beforeUpdate',
    updated: 'afterUpdate',
    destroyed: 'onDestroy',
  };
  let outtemplate = []

  if (sfc.template) {
    const template = compiler.compile(sfc.template.content);
    if (template.errors.length) {
      console.error(`Error(s) while parsing template:`);
      for (let error of template.errors) {
        console.log(error);
      }
      process.exit();
    }
    processTemplateNode(template.ast, outtemplate, 0, ' '.repeat(2));
  }
  outtemplate = outtemplate.join('');


  if (sfc.script) {
    const script = babelParser.parse(sfc.script.content, {
      sourceType: 'module',
    });

    const body = script.program.body;
    let exportDef = null;

    for (let i = 0; i < body.length; i++) {
      if (body[i].type === 'ExportDefaultDeclaration') {
        if (exportDef) {
          console.error(`Unable to parse script: `);
          process.exit(1);
        }
        exportDef = body[i];
        body.splice(i, 1);
        i--;
      }
    }


    output.push('<script>\n');
    let tm = parseouttemplate(outtemplate);
    codice = tm.codice
    includes = tm.includes
    output.push(includes);
    output.push('\n')
    //console.log(script);
    if (body.length > 0) {
      let tt = (babelGenerator(script).code || '').split('\n');
      for (let t of tt) {
        if (!t.includes(`"@eng/post`)) {
          output.push(`${t.replace('@eng', '$lib').replace('@', '$')}\n`);
        }
      }
    }
    output.push('\n')

    if (exportDef) {
      const props = exportDef.declaration.properties;
      let imports = [];
      let params = [];
      let data = [];
      let computed = [];
      let methods = [];
      let beforeCreate = null;
      let created = null;
      for (let prop of props) {
        if (prop.key.type !== 'Identifier') {
          console.warning(`Warning: in default export`, babelGenerator(prop.key).code, `is not an identifier, ignoring it.`);
          continue;
        }

        switch (prop.key.name) {
          case 'name':
            // Ignore for now
            break;
          case 'props':
            if (prop.value.type === 'ObjectExpression') {
              for (let param of prop.value.properties) {
                if (param.value.type === 'Identifier') {
                  params.push(`export let ${babelGenerator(param.key).code}; // ${param.value.name}`);
                } else
                  if (param.value.type === 'ObjectExpression') {
                    let props = {};
                    for (let prop of param.value.properties) {
                      props[prop.key.name] = prop.value;
                    }
                    let def = `export let ${babelGenerator(param.key).code}`;
                    if (props.default) {
                      def += ` = ${babelGenerator(props.default).code}`;
                    }
                    def += ';';
                    if (props.type) {
                      def += ` // ${babelGenerator(props.type).code}`;
                    }
                    if (props.required) {
                      def += props.type ? ', required' : ' // required';
                    }
                    if (props.validator) {
                      console.warn(`Warning:`, babelGenerator(param.key).code, `validator is ignored.`);
                    }
                    params.push(def);
                  } else {
                    console.warn(`Warning: unexpected prop`, babelGenerator(param.key).code, babelGenerator(param.value).code, `Ignoring it.`);
                    continue;
                  }
              }
            } else
              if (prop.value.type === 'ArrayExpression') {
                for (let param of prop.value.elements) {
                  if (param.type === 'StringLiteral') {
                    params.push(`export let ${param.value};`);
                  } else {
                    console.warn(`Warning: unexpected prop`, babelGenerator(param).code, `ignoring it`);
                    continue;
                  }
                }
              } else {
                console.warn(`Warning: in default export, property is neither an array nor an object, ignoring it`);
                continue;
              }
            break;
          case 'beforeCreate':
            if (prop.type !== 'ObjectMethod') {
              console.warn(`Warning: in default export,`, prop.key.name, `is not a function, ignoring it`);
              continue;
            }
            beforeCreate = unwrapFunctionBody(prop);
            break;
          case 'created':
            if (prop.type !== 'ObjectMethod') {
              console.warn(`Warning: in default export`, prop.key.name, `is not a function, ignoring it`);
              continue;
            }
            created = unwrapFunctionBody(prop);
            break;
          case 'mounted':
          case 'beforeUpdate':
          case 'updated':
          case 'destroyed':
            if (prop.type !== 'ObjectMethod') {
              console.warn(`Warning: in default export ${prop.key.name} is not a function, ignoring it`);
              continue;
            }

            prop.type = 'ArrowFunctionExpression';
            imports.push(HOOKS[prop.key.name]);
            methods.push(`${HOOKS[prop.key.name]}(${babelGenerator(processScriptNode(prop)).code});`);
            break;
          case 'data':
            let obj;
            if (prop.type === 'ObjectMethod') {
              if (prop.body.type === 'BlockStatement' &&
                prop.body.body.length === 1 &&
                prop.body.body[0].type === 'ReturnStatement' &&
                prop.body.body[0].argument.type === 'ObjectExpression') {
                obj = prop.body.body[0].argument;
              } else {
                console.warn(`Warning: in default export, data property contains too complex function, ignoring it`);
                continue;
              }
            } else
              if (prop.value.type === 'ObjectExpression') {
                obj = prop.value;
              } else {
                console.warn(`Warning: in default export data property is not an object expression, ignoring it`);
                continue;
              }

            for (let param of obj.properties) {
              data.push(`let ${babelGenerator(param.key).code} = ${babelGenerator(processScriptNode(param.value)).code};`);
            }
            break;
          // watch
          case 'computed':
            if (prop.value.type !== 'ObjectExpression') {
              console.warn(`Warning: in default export computed property is not an object expression, ignoring it`);
              continue;
            }

            // TODO: {get, set} format
            // TODO: vm => vm.a * 2 format

            for (let param of prop.value.properties) {
              if (param.type === 'ObjectMethod') {
                if (param.body.type === 'BlockStatement' &&
                  param.body.body.length === 1 &&
                  param.body.body[0].type === 'ReturnStatement') {
                  computed.push(`$: ${babelGenerator(param.key).code} = ${babelGenerator(processScriptNode(param.body.body[0].argument)).code};`);
                } else {
                  param.type = 'ArrowFunctionExpression';
                  computed.push(`$: ${babelGenerator(param.key).code} = (${babelGenerator(processScriptNode(param)).code})();`);
                }
              } else {
                console.warn(`Warning: unexpected computed ${babelGenerator(param.key).code} declaration: ${babelGenerator(param).code}}{yellow , ignoring it`);
                continue;
              }
            }
            break;
          case 'methods':
            if (prop.value.type !== 'ObjectExpression') {
              console.warn(`Warning: in default export, methods property is not an object expression, ignoring it`);
              continue;
            }

            for (let method of prop.value.properties) {
              if (method.type !== 'ObjectMethod') {
                console.warn(`Warning: in default export, method ${babelGenerator(method.key).code}} is not a function, ignoring it`);
                continue;
              }

              method.type = 'FunctionDeclaration';
              method.id = method.key;
              methods.push(babelGenerator(processScriptNode(method, true)).code);
            }
            break;
          default:
            console.warn(`Warning: in default export, ${babelGenerator(prop.key).code} is an unknown property, ignoring it`);
        }
      }
      function xonmount(beforeCreate, created) {
        if (beforeCreate || created) {
          return `
onMount(() =>{
  ${beforeCreate || ''} 
  ${created || ''}
});
`
        } else {
          return ''
        }
      }

      output.push(`
//---PARAMS
${params.concat(data, computed).join('\n')}
//---BEFORE
${xonmount(beforeCreate, created)}
//---METHODS
${methods.join('\n\n')}
</script>\n\n`);
    }
  }

  for (let style of sfc.styles) {
    let css = style.content;
    if (!style.scoped) {
      // TODO: move this to prettier, so the whitespace can be preserved
      const ast = csstree.parse(css);
      csstree.walk(ast, {
        visit: 'Selector',
        enter: function (node) {
          //console.log(node, node.children.head);
          const children = node.children;
          node.children = new csstree.List();
          node.children.appendData({
            type: 'PseudoClassSelector',
            loc: null,
            name: 'global',
            children,
          });
        }
      });
      css = csstree.generate(ast);
    }

    output.push('<style>\n', prettier.format(css, { parser: 'css' }), '</style>\n\n');
  }

  output.push(`\n${codice}`)
  fs.writeFileSync(outputPath, output.join('').replaceAll('$emit(', 'emit('), 'utf8');
}


function getAllFiles(dir, ext = '.txt', baseDir = dir) {
  let entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];

  for (let entry of entries) {
    let fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      let subFiles = getAllFiles(fullPath, ext, baseDir);
      files.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      files.push(path.relative(baseDir, fullPath));
    }
  }

  return files;
}


let ff = getAllFiles('convert', '.vue');
for (let f of ff) {
  console.log(`------------------------------------------------------------------------------`);
  console.log("FILE", f);
  parseinputPath(`convert/${f}`);


}
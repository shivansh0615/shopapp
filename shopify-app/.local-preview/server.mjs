import { createServer } from 'vite';
import path from 'node:path';
import ts from 'typescript';
const root = process.cwd();
const server = await createServer({
  configFile: false,
  root: path.join(root, '.local-preview'),
  publicDir: path.join(root, 'public'),
  esbuild: { jsx: 'automatic' },
  plugins: [{
    name: 'local-dashboard', enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req,res,next)=>{
        if (!req.url?.startsWith('/app/api/products/search')) return next();
        const query = new URL(req.url,'http://localhost').searchParams.get('q')?.toLowerCase() || '';
        const products = ['Aloe Vera Gift','Travel Pouch','Cotton Tote'].map((title,i)=>({id:'sample-product-'+i,title,featuredImage:null,firstVariant:{id:'sample-variant-'+i,title:'Default',price:'199.00'},available:true})).filter(p=>p.title.toLowerCase().includes(query));
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({products,publicationWarning:false}));
      });
    },
    transform(code, id) {
      if(id.replaceAll('\\','/').endsWith('/CampaignBuilderForm.tsx')) return code + '\nexport { DEFAULT_INITIAL as PREVIEW_DEFAULT_INITIAL };';
      if (!id.replaceAll('\\', '/').includes('/app/routes/')) return;
      const source = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const edits = source.statements.filter(node =>
        (ts.isImportDeclaration(node) && node.moduleSpecifier.text.includes('.server')) ||
        (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ['loader','action'].includes(d.name.getText(source))))
      );
      for (const node of edits.reverse()) code = code.slice(0,node.getFullStart()) + code.slice(node.end);
      return code;
    },
  }],
  server: { host: '127.0.0.1', port: 4173, strictPort: true, fs: { allow: [root] } },
});
await server.listen();
server.printUrls();

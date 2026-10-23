import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, NavLink, Outlet, redirect } from 'react-router';
import Overview from '../app/routes/app._index.tsx';
import Campaigns from '../app/routes/app.campaigns._index.tsx';
import Create from '../app/routes/app.campaigns.new.tsx';
import Edit from '../app/routes/app.campaigns.$id.tsx';
import Widgets from '../app/routes/app.widgets.tsx';
import Billing from '../app/routes/app.billing.tsx';
import Settings from '../app/routes/app.settings.tsx';
import Help from '../app/routes/app.help._index.tsx';
import CheckoutHelp from '../app/routes/app.help.accelerated-checkout.tsx';
import Diagnostics from '../app/routes/app.compatibility.tsx';
import Analytics from '../app/routes/app.analytics.tsx';
import '../app/styles/dashboard.css';
import './preview.css';
import '../app/styles/professional.css';
import { PREVIEW_DEFAULT_INITIAL } from '../app/components/campaigns/CampaignBuilderForm.tsx';
const data = {
  summary: { totalCampaigns: 1, activeCampaigns: 1, latestCampaigns: [{id:'preview',name:'AOV Enhancing Gift',campaignType:'Spend X -> Free Gift',status:'ACTIVE',createdAt:'2026-09-07',updatedAt:'2026-09-07'}] },
  analytics: { giftsAdded:0, giftsUnlocked:0, influencedOrders:0, revenueGenerated:0 },
  currencyCode:'INR', storePreviewHref:'#',
  health: { tone:'ready',statusLabel:'Ready',headline:'Promotions look ready to run.',actionTo:null,actionLabel:null,items:[['campaign_readiness','Campaign'],['discount_function_readiness','Shopify Function'],['app_proxy','App Proxy'],['theme_app_embed','Theme Embed']].map(([id,title])=>({id,title,tone:'ready',statusLabel:'Ready',detail:'',blurb:'',actionTo:null,actionLabel:null})) }
};
data.summary.latestCampaigns[0] = {...data.summary.latestCampaigns[0],currencyCode:'INR',threshold:999,giftQuantity:1,giftProductTitle:'Aloe Vera Gift',giftProductId:'sample-product',giftVariantId:'sample-variant',rewardTiers:[],startDate:null,endDate:null};
let settings = {currencyCode:'INR',defaultThreshold:999,defaultWidgetTemplate:'Premium',primaryColor:'#6d5dfb',backgroundColor:'#ffffff',textColor:'#171717',autoAddGift:true};
function Shell() {
  return <div className="preview-shell"><aside className="preview-nav"><div className="preview-brand"><img src="/upselltrix-mark.svg" alt=""/>UpsellTrix</div><small>LOCAL WORKSPACE</small>{[['/app','Overview'],['/app/campaigns','Campaigns'],['/app/widgets','Theme setup'],['/app/analytics','Analytics'],['/app/compatibility','Diagnostics'],['/app/billing','Billing'],['/app/settings','Settings'],['/app/help','Help']].map(([to,label])=><NavLink key={to} to={to} end={to==='/app'}>{label}</NavLink>)}<p>Design preview<br/>Sample data only</p></aside><div className="fgpb-admin preview-content"><Outlet/></div></div>;
}
async function previewAction({request}) { const form = await request.formData(); window.alert('Preview only: no changes were sent to Shopify.'); return {error:'Preview only — this action does not change your live store.'}; }
const common = {embedDeepLink:null,storePreviewHref:'/app/widgets',shop:'preview-store.myshopify.com',activeCampaignCount:1,integration:{storefrontActivityDetected:true,lastWidgetStateAt:new Date().toISOString()}};
const router = createBrowserRouter([{path:'/',loader:()=>redirect('/app')},{element:<Shell/>,children:[
  {path:'/app',loader:()=>data,element:<Overview/>},
  {path:'/app/campaigns',loader:()=>({campaigns:data.summary.latestCampaigns}),action:previewAction,element:<Campaigns/>},
  {path:'/app/campaigns/new',loader:()=>({currencyCode:'INR'}),action:previewAction,element:<Create/>},
  {path:'/app/campaigns/:id',loader:()=>({campaign:data.summary.latestCampaigns[0],initial:{...PREVIEW_DEFAULT_INITIAL,...data.summary.latestCampaigns[0],initialGift:{id:'sample-product',title:'Aloe Vera Gift',image:null,firstVariant:{id:'sample-variant',title:'Default'}}}}),action:previewAction,element:<Edit/>},
  {path:'/app/widgets',loader:({request})=>{
    const state = new URL(request.url).searchParams.get('themeState');
    return {...common,embedDeepLink:state==='missing-link'?null:'/preview/theme-editor',activeCampaignCount:state==='inactive'?0:1,integration:{...common.integration,storefrontActivityDetected:!['waiting','inactive'].includes(state),lastWidgetStateAt:['waiting','inactive'].includes(state)?null:common.integration.lastWidgetStateAt}};
  },element:<Widgets/>},
  {path:'/preview/theme-editor',element:<div style={{padding:32}}><h1>Shopify theme editor</h1><p>This button opens Shopify’s theme editor in the live app. This local preview does not change your theme.</p><NavLink to="/app/widgets">Return to Theme setup</NavLink></div>},
  {path:'/app/billing',element:<Billing/>},
  {path:'/app/settings',loader:()=>({settings}),action:async({request})=>{settings={...settings,...Object.fromEntries(await request.formData())};window.alert('Saved in this local preview only.');return null;},element:<Settings/>},
  {path:'/app/help',element:<Help/>},
  {path:'/app/help/accelerated-checkout',element:<CheckoutHelp/>},
  {path:'/app/analytics',loader:()=>({summary:data.analytics,currencyCode:'INR'}),element:<Analytics/>},
  {path:'/app/compatibility',loader:()=>({...common,report:{shop:common.shop,generatedAt:new Date().toISOString(),overall:'READY',overallExplanation:'Sample diagnostics for the local design preview.',checks:data.health.items.map(i=>({id:i.id,label:i.title,status:'pass',explanation:'Sample ready state — not a live check.',merchantAction:null,technicalDetails:null}))}}),element:<Diagnostics/>},
  {path:'*',element:<p style={{padding:30}}>This screen connects to Shopify in the live app. <NavLink to="/app">Back to Overview</NavLink></p>}
]}]);
createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);

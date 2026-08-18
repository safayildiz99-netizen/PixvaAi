import { Component } from 'react';
import { AlertTriangle, RefreshCw, MessageSquare } from 'lucide-react';

export default class AppErrorBoundary extends Component {
  constructor(props){
    super(props);
    this.state={error:null};
  }
  static getDerivedStateFromError(error){
    return {error};
  }
  componentDidCatch(error,info){
    console.error('PIXVA Bereichsfehler:',error,info);
  }
  componentDidUpdate(prevProps){
    if(prevProps.resetKey!==this.props.resetKey && this.state.error){
      this.setState({error:null});
    }
  }
  render(){
    if(!this.state.error) return this.props.children;
    const message=String(this.state.error?.message||'Unbekannter Fehler');
    return <div className="workspace-error-boundary">
      <AlertTriangle size={34}/>
      <h2>Dieser PIXVA-Bereich konnte nicht vollständig geladen werden.</h2>
      <p>Die App bleibt geöffnet. Du musst die Seite nicht neu starten.</p>
      <code>{message}</code>
      <div>
        <button onClick={()=>{this.setState({error:null});this.props.onRetry?.()}}><RefreshCw size={16}/> Bereich erneut laden</button>
        <button onClick={()=>{this.setState({error:null});this.props.onBackToChat?.()}}><MessageSquare size={16}/> Zum Chat</button>
      </div>
    </div>;
  }
}

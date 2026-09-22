import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type InfozillionConfig = {
  baseUrl: string; apiType: 'iptsp'|'mno'; username: string; password: string;
  billMsisdn: string; apiKey: string; usernameSecondary?: string;
  passwordSecondary?: string; billMsisdnSecondary?: string; cli?: string;
  transactionType?: string; messageType?: string; isLongSms?: boolean;
};

@Injectable()
export class InfozillionService {
  private readonly success = '9000';
  private endpoint(c: InfozillionConfig, action: string) {
    const ip = c.apiType === 'iptsp';
    return {
      send: `${c.baseUrl.replace(/\/$/, '')}/${ip?'a2p-sms-iptsp/api/v1/send-sms':'a2p-sms/api/v1/send-sms'}`,
      dlr: `${c.baseUrl.replace(/\/$/, '')}/${ip?'a2p-proxy-api-iptsp/api/v1/check-delivery-report':'a2p-proxy-api/api/v1/check-delivery-report'}`,
      credit: `${c.baseUrl.replace(/\/$/, '')}/${ip?'a2p-proxy-api-iptsp/api/v1/check-credit-balance':'a2p-proxy-api/api/v1/check-credit-balance'}`,
      wallet: `${c.baseUrl.replace(/\/$/, '')}/a2p-wallet/api/v1/check-current-balance`,
    }[action as 'send'|'dlr'|'credit'|'wallet'];
  }
  private async post(url:string, body:Record<string,unknown>) {
    const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(Number(process.env.INFOZILLION_TIMEOUT_MS||10000))});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new ServiceUnavailableException(data?.serverResponseMessage || `InfoZillion HTTP ${r.status}`);
    return data as Record<string,any>;
  }
  async send(c:InfozillionConfig,to:string,body:string,senderId?:string,isUnicode=false){
    let cli=(senderId||c.cli||'').trim();
    const digits=cli.replace(/\D/g,'');
    if(cli && digits && !/[a-zA-Z]/.test(cli)){ cli=digits.startsWith('0')?'880'+digits.slice(1):digits.startsWith('880')?digits:'880'+digits; }
    const billMsisdn=/^[0-9]+$/.test(cli)?cli:c.billMsisdn;
    const payload={username:c.username,password:c.password,billMsisdn,usernameSecondary:c.usernameSecondary||'',passwordSecondary:c.passwordSecondary||'',billMsisdnSecondary:c.billMsisdnSecondary||'',apiKey:c.apiKey,cli,msisdnList:[to.replace(/^\+/,'')],transactionType:c.transactionType||'T',messageType:isUnicode?'3':(c.messageType||'1'),isLongSMS:c.isLongSms ?? body.length>160,message:body};
    const data=await this.post(this.endpoint(c,'send'),payload);
    if(String(data.serverResponseCode)!==this.success) throw new ServiceUnavailableException(data.serverResponseMessage||'InfoZillion rejected SMS');
    return {gatewayMessageId:data.serverTxnId,raw:data};
  }
  async bulk(c:InfozillionConfig,to:string[],body:string,senderId?:string,isUnicode=false){
    const cli=(senderId||c.cli||'').trim();
    const payload={username:c.username,password:c.password,billMsisdn:c.billMsisdn,usernameSecondary:c.usernameSecondary||'',passwordSecondary:c.passwordSecondary||'',billMsisdnSecondary:c.billMsisdnSecondary||'',apiKey:c.apiKey,cli,msisdnList:to.map(x=>x.replace(/^\+/,'')),transactionType:c.transactionType||'P',messageType:isUnicode?'3':(c.messageType||'1'),isLongSMS:c.isLongSms ?? body.length>160,message:body};
    const data=await this.post(this.endpoint(c,'send'),payload);
    if(String(data.serverResponseCode)!==this.success) throw new ServiceUnavailableException(data.serverResponseMessage||'InfoZillion rejected bulk SMS');
    return {gatewayBatchId:data.serverTxnId,raw:data};
  }
  async delivery(c:InfozillionConfig,gatewayMessageId:string,recipient?:string){
    const data=await this.post(this.endpoint(c,'dlr'),{username:c.username,password:c.password,billMsisdn:c.billMsisdn,usernameSecondary:c.usernameSecondary||'',passwordSecondary:c.passwordSecondary||'',billMsisdnSecondary:c.billMsisdnSecondary||'',apiKey:c.apiKey,msisdnList:recipient?[recipient.replace(/^\+/,'')]:[],serverReference:gatewayMessageId});
    return data;
  }
  async balance(c:InfozillionConfig,mno?:string){
    const data=await this.post(this.endpoint(c,mno?'credit':'wallet'),mno?{username:c.username,password:c.password,mno,apiKey:c.apiKey}:{apiKey:c.apiKey});
    if(String(data.serverResponseCode)!==this.success) throw new ServiceUnavailableException(data.serverResponseMessage||'InfoZillion balance check failed');
    return data.availableBalance;
  }
}
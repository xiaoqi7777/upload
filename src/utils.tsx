export { };
interface OPTIONS {
  method:string,
  url:string,
  headers?:any,
  data?:any,
  baseURL?:string,
  setXHR?:any,
  onProgress?:any
}

export function request(options:OPTIONS):Promise<any>{
  let defaultOptions = {
    method:'Get',
    headers:{},//请求头
    baseURL:'http://localhost:8000',
    data:{},//请求体
  }
  options = {...defaultOptions,...options,headers:{...defaultOptions.headers,...(options.headers||{})}}
  return new Promise(function(resolve:Function,reject:Function){
    let xhr = new XMLHttpRequest()
    xhr.open(options.method,options.baseURL+options.url);
    for(let key in options.headers){
      xhr.setRequestHeader(key,options.headers[key])
    }
    xhr.responseType = 'json';
    // 每当进度发生变化后 会更改这个函数
    // xhr.upload 指上传的过程 onprogress onprogress处理事件
    xhr.upload.onprogress = options.onProgress
    // xhr.onload 和 xhr.onreadystatechange 都可以
    xhr.onreadystatechange = function(){
      if(xhr.readyState === 4){
        if(xhr.status === 200){
          resolve(xhr.response)
        }else{
          reject(xhr.response)
        }
      }
    }
    if(options.setXHR){
      options.setXHR(xhr);
    }
    xhr.send(options.data)
  })
}

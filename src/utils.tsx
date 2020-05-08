export { };
interface OPTIONS{
  method?:string,
  url?:string,
  headers?:any,
  data?:any,
  onProgress?:any,
  setXHR?:any
}
export function request(options:OPTIONS):Promise<any>{
  let defaultOptions = {
    method:'GET',
    headers:{},//请求头
    baseUrl:'http://localhost:8000',
    data:{}
  }
  options = {...defaultOptions,...options,headers:{...defaultOptions.headers,...(options.headers||{})}}
  return new Promise((resolve:Function,reject:Function)=>{
    let xhr = new XMLHttpRequest()
    xhr.open(options.method!,defaultOptions.baseUrl+options.url);
    xhr.responseType = 'json'
    // xhr.upload 指上传的过程 onprogress onprogress处理事件
    xhr.upload.onprogress = options.onProgress
    xhr.onreadystatechange = function(){
      if(xhr.readyState === 4){
        if(xhr.status === 200){
          console.log('1')
          resolve(xhr.response)
        }else{
          console.log('2')
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
export { };

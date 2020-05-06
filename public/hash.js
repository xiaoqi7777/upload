// self固定写法 代表当前窗口
self.importScripts('https://cdn.bootcss.com/spark-md5/3.0.0/spark-md5.js');
self.onmessage = async (event) => {
  
  let { partList } = event.data;
  const spark = new self.SparkMD5.ArrayBuffer()
  let percent = 0;// 总体计算hash的百分比
  let perSize = 100 / partList.length;// perSize是文件的大小 每计算完一个part,相当于完成了百分之几
  let buffers = await Promise.all(partList.map(({chunk,size})=> new Promise(function(resolve){
    // h5 读文件的类
    const reader = new FileReader();
    reader.readAsArrayBuffer(chunk);
    reader.onload = function(event){
      percent += perSize
      // 给主进程发送 toFixed(2)保留2位小数
      self.postMessage({percent:Number(percent.toFixed(2))})
      resolve(event.target.result)
    }
  })));
  buffers.forEach(buffer => spark.append(buffer));
  // 通知住进程 当前的hash计算已经全部完成 并且把最终的hash值给主进程发过去
  self.postMessage({percent:100,hash:spark.end()})
  self.close();
}



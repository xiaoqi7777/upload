// self固定写法 代表当前窗口
self.importScripts('https://cdn.bootcss.com/spark-md5/3.0.0/spark-md5.js');

self.onmessage = async function(event){
  // partList 保存在所有的切片
  let {partList} = event.data
  const spark = new self.SparkMD5.ArrayBuffer()
  // 计算总体的hash百分比
  let percent = 0;
  // 每次计算完一个part 相当于完成了百分之几
  let perSize = 100/partList.length;
  let buffers = await Promise.all(partList.map(({chunk,size})=>new Promise((resolve)=>{
    // h5读取文件
    const reader = new FileReader()
    reader.readAsArrayBuffer(chunk)
    // 加载完成
    reader.onload = function(event){
      percent += perSize
      self.postMessage({percent:Number(percent.toFixed(2))})
      resolve(event.target.result)
    }
  })))
  buffers.forEach(buffer => spark.append(buffer))
  self.postMessage({percent:100,hash:spark.end()})
  self.close();
}
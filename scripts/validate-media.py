"""Decode every shipped frame through libvpx-vp9 and verify actual RGBA, not metadata."""
import argparse,hashlib,json,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--ffmpeg',required=True);p.add_argument('--out',required=True);a=p.parse_args()
root=Path(__file__).resolve().parent.parent;manifest=json.loads((root/'assets-manifest.json').read_text(encoding='utf8'));rows=[]
for item in manifest['files']:
    file=root/'09-桌宠集成/动作配置/动作资源'/item['file'];assert hashlib.sha256(file.read_bytes()).hexdigest()==item['sha256']
    proc=subprocess.Popen([a.ffmpeg,'-v','error','-xerror','-c:v','libvpx-vp9','-i',str(file),'-an','-f','rawvideo','-pix_fmt','rgba','-'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    size=item['width']*item['height']*4;n=0
    while True:
        frame=proc.stdout.read(size)
        if not frame:break
        if len(frame)!=size:raise RuntimeError('partial decoded frame')
        alpha=frame[3::4]
        if alpha.count(0)<len(alpha)*.02 or alpha.count(255)<len(alpha)*.002:raise RuntimeError('alpha/background/foreground missing')
        n+=1
    err=proc.stderr.read();code=proc.wait()
    if code or err or n!=item['frames']:raise RuntimeError('video decode/frame count failed: '+item['file'])
    rows.append({'file':item['file'],'status':'PASS','decodedFrames':n,'alpha':'actual_rgba'})
Path(a.out).parent.mkdir(parents=True,exist_ok=True);Path(a.out).write_text(json.dumps({'status':'PASS','files':rows},ensure_ascii=False,indent=2),encoding='utf8');print('PASS: all eight real VP9 Alpha videos decoded')

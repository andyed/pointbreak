#!/usr/bin/env python3
"""Fixed protocol for the restored August 15 clean field clip.

Usage: python3 scripts/measure_field_wave.py VIDEO [--out OUTPUT_DIR]
Requires OpenCV, numpy, scipy and matplotlib. Raw field frames stay in ignored QA.
See docs/research/FIELD_WAVE_MOTION_2026-09-15.md for scope and limitations.
"""
from pathlib import Path
import argparse, hashlib
import cv2, json, numpy as np
from scipy.signal import butter,sosfiltfilt,detrend,find_peaks
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ap=argparse.ArgumentParser(description=__doc__)
ap.add_argument('video',type=Path)
ap.add_argument('--out',type=Path,default=Path('qa/field-motion-2026-09-15'))
args=ap.parse_args();root=args.out.resolve();root.mkdir(parents=True,exist_ok=True)
hash_state=hashlib.sha256()
with args.video.open('rb') as source:
 while chunk:=source.read(8*1024*1024):hash_state.update(chunk)
source_hash=hash_state.hexdigest()
assert source_hash=='11428e3fa283bea0834c724c7a6c79d6bb6b506ae9e0885525d43ee08e962695', 'This protocol requires the exact clean reference clip.'
cap=cv2.VideoCapture(str(args.video))
fps=cap.get(cv2.CAP_PROP_FPS); n=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
assert fps==30 and n==1825
rows=[];bands=[];motion=[];shifts=[];previous=None;stills={};ts=[]
yrows=[560,580,600,620,640,660]
for i in range(n):
 ok,bgr=cap.read()
 assert ok
 if i%3:continue
 t=i/fps; gray=cv2.cvtColor(bgr,cv2.COLOR_BGR2GRAY)
 small=cv2.resize(gray,(1144,643),interpolation=cv2.INTER_AREA)
 rows.append([float(gray[y-3:y+4,400:2000].mean()) for y in yrows])
 bands.append(small[340:415,:].mean(0))
 if previous is not None:
  motion.append(float(np.abs(small[340:440,:].astype(float)-previous[340:440,:]).mean()))
  ref=previous[570:620,300:550].astype(np.float32)
  cur=small[570:620,300:550].astype(np.float32)
  delta,response=cv2.phaseCorrelate(ref,cur,cv2.createHanningWindow((250,50),cv2.CV_32F))
  shifts.append([t,*delta,response])
 previous=small;ts.append(t)
 if t in [0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40,42,44,46,48,50,52,54,56,58,60]:stills[t]=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)
cap.release();ts=np.array(ts);rows=np.array(rows);bands=np.array(bands)
sos=butter(3,[1/24,1/9],btype='bandpass',fs=10,output='sos')
results=[];raw_recurrence={};filtered_recurrence={}
fig,axes=plt.subplots(3,1,figsize=(12,9),layout='constrained')
for k,y in enumerate(yrows):
 raw=detrend(rows[:,k]);f=sosfiltfilt(sos,raw)
 peaks,_=find_peaks(f,distance=110,prominence=np.std(f)*.65)
 peaks=peaks[(ts[peaks]>=4)&(ts[peaks]<=54)]
 ac=[]
 for lag in range(90,241):ac.append(float(np.corrcoef(f[:-lag],f[lag:])[0,1]))
 best=int(np.argmax(ac))+90
 raw_ac=[float(np.corrcoef(raw[:-lag],raw[lag:])[0,1]) for lag in range(90,241)]
 raw_best=int(np.argmax(raw_ac))+90
 raw_recurrence[y]=raw_ac;filtered_recurrence[y]=ac
 results.append({'y':y,'peak_times_clean_s':ts[peaks].tolist(),'intervals_s':np.diff(ts[peaks]).tolist(),'filtered_recurrence_s':best/10,'filtered_recurrence_r':max(ac),'unfiltered_recurrence_s':raw_best/10,'unfiltered_recurrence_r':max(raw_ac)})
 if y==580:
  axes[0].plot(ts,raw,label='Detrended raw row brightness',alpha=.55)
  axes[0].plot(ts,f,label='9–24 s bandpass',lw=2)
  axes[0].plot(ts[peaks],f[peaks],'o')
  for p in peaks:axes[0].annotate(f'{ts[p]:.1f}s',(ts[p],f[p]),xytext=(0,9),textcoords='offset points',ha='center')
axes[0].set(title='Fixed outer-water row: clean clip time, y=580, x=400–2000',ylabel='Luma deviation');axes[0].legend()
axes[1].imshow(bands,aspect='auto',extent=[0,2288,ts[-1],0],cmap='gray');axes[1].set(title='Breaking-band brightness, y=680–830 (image coordinates)',ylabel='Clean clip time (s)',xlabel='Source image x (px)')
axes[2].plot(ts[1:],motion);axes[2].set(title='Motion gate: 0.1 s frame changes over water, y=680–880',xlabel='Clean clip time (s)',ylabel='Mean absolute luma change')
fig.savefig(root/'field-diagnostics.png',dpi=140)
plt.close(fig)
# Durable derived plot: numeric signals only; the image contact sheets remain local.
fig,axes=plt.subplots(2,1,figsize=(11,7),layout='constrained')
raw=detrend(rows[:,1]);filtered=sosfiltfilt(sos,raw)
axes[0].plot(ts,raw,label='Detrended raw row brightness',alpha=.6)
axes[0].plot(ts,filtered,label='9–24 s bandpass',lw=2)
for t in results[1]['peak_times_clean_s']:
 y=filtered[int(round(t*10))];axes[0].plot(t,y,'o',color='#087e8b');axes[0].annotate(f'{t:.1f}s',(t,y),xytext=(0,8),textcoords='offset points',ha='center')
axes[0].set(title='Preselected outer-water transect: y=580, x=400–2000',xlabel='Clean clip time (s)',ylabel='Luma deviation');axes[0].legend(loc='upper right')
lags=np.arange(90,241)/10
axes[1].plot(lags,raw_recurrence[580],label=f"Unfiltered: {results[1]['unfiltered_recurrence_s']:.1f} s, r={results[1]['unfiltered_recurrence_r']:.3f}",lw=2)
axes[1].plot(lags,filtered_recurrence[580],label=f"Bandpassed: {results[1]['filtered_recurrence_s']:.1f} s, r={results[1]['filtered_recurrence_r']:.3f}",lw=2)
axes[1].set(title='Lagged Pearson correlation over overlapping samples',xlabel='Recurrence lag (s)',ylabel='Correlation');axes[1].legend()
fig.suptitle('Restored field video supports an approximately 16-second carrier',fontsize=14)
fig.supxlabel('One 60.83 s unique clip; two selected peak intervals. No set-cadence or absolute-speed claim.',fontsize=10)
fig.savefig(root/'carrier-period.png',dpi=140);plt.close(fig)
for start in [0,16,32,48]:
 times=[t for t in [start+x for x in range(0,14,2)] if t in stills]
 fig,axes=plt.subplots(len(times),1,figsize=(14,len(times)*1.9),layout='constrained')
 for ax,t in zip(axes,times):
  ax.imshow(stills[t][660:900,:]);ax.set_title(f'Clean clip {t:.1f} s / source {t+40.9:.1f} s',loc='left',fontsize=10);ax.axis('off')
 fig.savefig(root/f'wave-{start}.jpg',dpi=140);plt.close(fig)
# Fine visual audit of one local collapse, frame indices recorded in the research note.
detail_cap=cv2.VideoCapture(str(args.video))
fig,axes=plt.subplots(6,2,figsize=(14,10),layout='constrained')
for ax,i in zip(axes.flat,range(330,414,7)):
 detail_cap.set(cv2.CAP_PROP_POS_FRAMES,i);ok,bgr=detail_cap.read();assert ok
 ax.imshow(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)[680:880,450:1250]);ax.axis('off')
 ax.set_title(f'clean {i/30:.3f} s · source {i/30+40.9:.3f} s',loc='left',fontsize=10)
fig.savefig(root/'lip-detail.jpg',dpi=150);plt.close(fig);detail_cap.release()
np.savez_compressed(root/'signals.npz',times=ts,rows=rows,band=bands,motion=motion,shifts=shifts)
shifts=np.array(shifts);valid=shifts[:,3]>.5
report={'source_sha256':source_hash,'source_name':args.video.name,'protocol':{'original_source_offset_s':40.9,'source_fps':fps,'source_frames':n,'sample_stride_frames':3,'carrier_rows':yrows,'carrier_x_range':[400,2000],'row_half_width':3,'filter':'third-order Butterworth, 9–24 seconds, zero-phase sosfiltfilt','peak_rule':'distance >=11 s; prominence >=0.65 filtered SD; retain t=4..54 s','motion_roi_original':[0,680,2288,880],'motion_downsample':2},'sample_fps':10,'samples':len(ts),'frame_motion':{'median_luma_change':float(np.median(motion)),'p10':float(np.percentile(motion,10)),'steps_above_1_5':int(np.sum(np.array(motion)>1.5)),'total_steps':len(motion)},'background_translation':{'roi_original':[600,1140,1100,1240],'units':'half-resolution image pixels per 0.1 s','response_above_0_5':int(valid.sum()),'total':len(shifts),'absolute_xy_p95':np.percentile(np.abs(shifts[valid,1:3]),95,axis=0).tolist()},'carrier':results}
(root/'measurements.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

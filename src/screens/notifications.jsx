import { useEffect } from 'react';
import { useStore } from '../store';
import { Header, Icon, Empty, useNav } from '../ui';
import { timeAgo } from '../geo';

const IC = { track: ['car', 'green'], chat: ['chat', 'blue'], match: ['bell', 'amber'], done: ['check', 'green'], reminder: ['clock', 'amber'], booking: ['calendar', 'blue'], system: ['info', ''], fav: ['heart', 'red'], help: ['alert', 'red'] };

export default function Notifications() {
  const { state, markAllRead } = useStore();
  const nav = useNav();
  const list = state.notifications;
  useEffect(() => () => markAllRead(), []); // eslint-disable-line
  return (
    <div className="screen no-tab">
      <Header title="Notifications" right={list.some((n) => !n.read) && <button className="link" onClick={markAllRead}>Mark all read</button>} />
      {list.length ? list.map((n) => {
        const [ic, tone] = IC[n.type] || IC.system;
        return (
          <button key={n.id} className={'notif' + (n.read ? '' : ' unread')} onClick={() => (n.helpId ? nav.go('help', { helpId: n.helpId }) : n.rideId && nav.openRide(n.rideId))}>
            <span className={'row-ic ' + tone}><Icon name={ic} size={18} /></span>
            <span className="grow">
              <b style={{ fontSize: 14.5, display: 'block' }}>{n.title}</b>
              {n.body && <small style={{ display: 'block', fontSize: 13 }}>{n.body}</small>}
              <small style={{ fontSize: 11.5 }}>{timeAgo(n.at)}</small>
            </span>
          </button>
        );
      }) : <div className="card"><Empty icon="bell" title="You're all caught up" text="Booking updates, ride alerts and messages will show here." /></div>}
    </div>
  );
}
